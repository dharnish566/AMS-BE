import { AppError } from '../../utils/appError.js';
import * as service from './service.js';

function frontendRedirect(query) {
  const base = process.env.FRONTEND_ORIGIN?.split(',')[0] ?? 'http://localhost:5173';
  return `${base}/admin/integrations/dropbox?${new URLSearchParams(query)}`;
}

export async function status(req, res, next) {
  try {
    if (req.auth.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only professors can manage Dropbox.');
    }
    res.json(await service.connectionStatus(req.auth.userId));
  } catch (error) {
    next(error);
  }
}

export async function connect(req, res, next) {
  try {
    if (req.auth.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only professors can connect Dropbox.');
    }
    res.json({ authorizationUrl: await service.startOAuth(req.auth.userId) });
  } catch (error) {
    next(error);
  }
}

export async function callback(req, res) {
  const isPopup = req.query.popup === 'true' || Boolean(req.headers['sec-fetch-dest'] === 'document');

  // Handle Dropbox returning an OAuth error (e.g. user canceled or Google sign-in failed on Dropbox)
  if (req.query.error) {
    const errorMsg = req.query.error_description || req.query.error;
    const target = frontendRedirect({ error: req.query.error, message: errorMsg });
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Dropbox Authorization</title></head>
        <body>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage({ type: 'DROPBOX_FAILED', error: ${JSON.stringify(errorMsg)} }, '*');
              } catch (e) {}
              window.close();
            } else {
              window.location.href = ${JSON.stringify(target)};
            }
          </script>
          <p>Dropbox authorization was not completed. Redirecting... <a href="${target}">Click here if not redirected</a></p>
        </body>
      </html>
    `);
  }

  try {
    await service.finishOAuth({ code: req.query.code, state: req.query.state });
    const target = frontendRedirect({ connected: 'true' });
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Dropbox Connected</title></head>
        <body>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage({ type: 'DROPBOX_CONNECTED', connected: true }, '*');
              } catch (e) {}
              window.close();
            } else {
              window.location.href = ${JSON.stringify(target)};
            }
          </script>
          <p>Dropbox connected successfully. Redirecting... <a href="${target}">Click here if not redirected</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    const target = frontendRedirect({ error: error.code ?? 'DROPBOX_OAUTH_FAILED', message: error.message });
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Dropbox Authorization Error</title></head>
        <body>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage({ type: 'DROPBOX_FAILED', error: ${JSON.stringify(error.message)} }, '*');
              } catch (e) {}
              window.close();
            } else {
              window.location.href = ${JSON.stringify(target)};
            }
          </script>
          <p>Dropbox connection error: ${error.message}. Redirecting... <a href="${target}">Click here if not redirected</a></p>
        </body>
      </html>
    `);
  }
}

export async function disconnect(req, res, next) {
  try {
    if (req.auth.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only professors can disconnect Dropbox.');
    }
    res.json(await service.disconnect(req.auth.userId));
  } catch (error) {
    next(error);
  }
}

export async function sync(req, res, next) {
  try {
    if (req.auth.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only professors can trigger Dropbox sync.');
    }
    const { runDropboxSync } = await import('./syncService.js');
    res.json(await runDropboxSync());
  } catch (error) {
    next(error);
  }
}
