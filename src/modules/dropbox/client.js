import { AppError } from '../../utils/appError.js';

const API = 'https://api.dropboxapi.com/2';

function dropboxError(status, body, headers = {}) {
  const summary = body?.error_summary || body?.error?.error_summary || (typeof body?.error === 'string' ? body.error : 'Dropbox request failed.');
  const retryAfter = headers.get ? headers.get('retry-after') : headers['retry-after'];
  const error = new AppError(
    status === 401 ? 503 : status === 429 ? 429 : 502,
    status === 401 ? 'DROPBOX_REAUTH_REQUIRED' : status === 429 ? 'DROPBOX_RATE_LIMITED' : 'DROPBOX_API_ERROR',
    summary.replace(/\.$/, '') + '.'
  );
  error.dropboxBody = body;
  if (retryAfter) {
    error.retryAfter = Number(retryAfter) || 60;
  }
  return error;
}

async function request(url, accessToken, arg) {
  const isPostWithArg = arg !== undefined;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: isPostWithArg ? JSON.stringify(arg) : '{}',
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw dropboxError(response.status, body, response.headers);
  }
  return body;
}

export async function exchangeCode({ appKey, appSecret, redirectUri, code, codeVerifier }) {
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: appKey,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  });

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw dropboxError(response.status, result, response.headers);
  }
  return result;
}

export async function refreshAccessToken({ appKey, appSecret, refreshToken }) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: appKey,
    client_secret: appSecret,
  });

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw dropboxError(response.status, result, response.headers);
  }
  return result;
}

export const dropboxApi = {
  account(accessToken) {
    return request(`${API}/users/get_current_account`, accessToken);
  },
  createRequest(accessToken, arg) {
    return request(`${API}/file_requests/create`, accessToken, arg);
  },
  getRequest(accessToken, id) {
    return request(`${API}/file_requests/get`, accessToken, { id });
  },
  listFolder(accessToken, path) {
    return request(`${API}/files/list_folder`, accessToken, {
      path,
      recursive: false,
      include_deleted: false,
    });
  },
  listFolderContinue(accessToken, cursor) {
    return request(`${API}/files/list_folder/continue`, accessToken, { cursor });
  },
  getMetadata(accessToken, path) {
    return request(`${API}/files/get_metadata`, accessToken, { path });
  },
  async revokeToken(accessToken) {
    try {
      await request(`${API}/auth/token/revoke`, accessToken, null);
    } catch {
      // Ignore token revocation failure if token is already expired/revoked
    }
  },
};

export async function listFolderAll(accessToken, path) {
  try {
    let page = await dropboxApi.listFolder(accessToken, path);
    const entries = [...(page.entries ?? [])];
    while (page.has_more && page.cursor) {
      page = await dropboxApi.listFolderContinue(accessToken, page.cursor);
      entries.push(...(page.entries ?? []));
    }
    return entries;
  } catch (error) {
    // If the folder was never created yet because no file has been uploaded into the file request,
    // Dropbox returns path/not_found. Treat this safely as an empty directory.
    const summary = error?.dropboxBody?.error_summary || error?.message || '';
    if (summary.includes('path/not_found')) {
      return [];
    }
    throw error;
  }
}

export function authorizationUrl({ appKey, redirectUri, state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    redirect_uri: redirectUri,
    token_access_type: 'offline',
    scope: 'account_info.read files.metadata.read file_requests.read file_requests.write',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://www.dropbox.com/oauth2/authorize?${params}`;
}
