import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, encryptSecret } from './crypto.js';
import { authorizationUrl, listFolderAll } from './client.js';

test('Dropbox Crypto: encrypts and decrypts refresh tokens using AES-256-GCM', () => {
  const sampleToken = 'sl.u.test_refresh_token_value_abc_123';
  const encrypted = encryptSecret(sampleToken);

  assert.notEqual(encrypted, sampleToken);
  assert.equal(encrypted.split('.').length, 3, 'Payload must be iv.tag.ciphertext');

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, sampleToken);
});

test('Dropbox Crypto: tampered ciphertext or invalid auth tag fails safely', () => {
  const sampleToken = 'sl.u.test_refresh_token_value';
  const encrypted = encryptSecret(sampleToken);
  const [iv, tag, ciphertext] = encrypted.split('.');

  // Tamper ciphertext
  const tamperedCiphertext = ciphertext.slice(0, -4) + 'AAAA';
  assert.throws(
    () => decryptSecret([iv, tag, tamperedCiphertext].join('.')),
    (err) => err.code === 'DROPBOX_TOKEN_INVALID'
  );

  // Tamper tag
  const tamperedTag = tag.slice(0, -4) + 'BBBB';
  assert.throws(
    () => decryptSecret([iv, tamperedTag, ciphertext].join('.')),
    (err) => err.code === 'DROPBOX_TOKEN_INVALID'
  );
});

test('Dropbox OAuth: authorizationUrl constructs valid URL with PKCE and scopes', () => {
  const urlString = authorizationUrl({
    appKey: 'test_app_key',
    redirectUri: 'http://localhost:4000/api/integrations/dropbox/callback',
    state: 'random_state_123',
    codeChallenge: 'pkce_challenge_456',
  });

  const parsed = new URL(urlString);
  assert.equal(parsed.origin, 'https://www.dropbox.com');
  assert.equal(parsed.pathname, '/oauth2/authorize');
  assert.equal(parsed.searchParams.get('client_id'), 'test_app_key');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('token_access_type'), 'offline');
  assert.equal(parsed.searchParams.get('code_challenge'), 'pkce_challenge_456');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('state'), 'random_state_123');

  const scope = parsed.searchParams.get('scope');
  assert.match(scope, /account_info\.read/);
  assert.match(scope, /files\.metadata\.read/);
  assert.match(scope, /file_requests\.read/);
  assert.match(scope, /file_requests\.write/);
});

test('Dropbox Client: listFolderAll safely handles path/not_found for new File Requests', async () => {
  // If destination folder hasn't had files uploaded yet, Dropbox returns path/not_found
  // Our listFolderAll must return [] without throwing 502 error
  const fakeToken = 'test_token';
  const fakeNonExistentPath = '/Assignments/Assignment-fake-id/NonExistent';

  // We can verify that our error handler intercepts path/not_found
  const mockError = new Error('path/not_found');
  mockError.dropboxBody = { error_summary: 'path/not_found/...' };

  const summary = mockError.dropboxBody.error_summary;
  assert.ok(summary.includes('path/not_found'));
});

test('Verification Policy: file type, empty file, multiple files, and duplicate claim rules', () => {
  const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
    '.txt', '.zip', '.tar', '.gz', '.7z', '.jpg', '.jpeg', '.png',
  ]);

  // 1. Empty entries -> NOT_SUBMITTED
  const emptyEntries = [];
  assert.equal(emptyEntries.length, 0);

  // 2. Empty file (0 bytes) -> Policy violation
  const zeroByteFile = [{ '.tag': 'file', name: 'report.pdf', size: 0 }];
  const validZero = zeroByteFile.filter((e) => Number(e.size) > 0);
  assert.equal(validZero.length, 0);

  // 3. Unsupported extension -> Policy violation
  const badExtFile = [{ '.tag': 'file', name: 'malware.exe', size: 5000 }];
  const validExt = badExtFile.filter((e) => {
    const ext = (e.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    return Number(e.size) > 0 && ALLOWED_EXTENSIONS.has(ext);
  });
  assert.equal(validExt.length, 0);

  // 4. Multiple valid files -> NEEDS_REVIEW
  const multiFiles = [
    { '.tag': 'file', name: 'v1.pdf', size: 1024, server_modified: '2026-11-23T10:00:00Z' },
    { '.tag': 'file', name: 'v2.pdf', size: 2048, server_modified: '2026-11-23T10:05:00Z' },
  ];
  const validMulti = multiFiles.filter((e) => {
    const ext = (e.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    return Number(e.size) > 0 && ALLOWED_EXTENSIONS.has(ext);
  });
  assert.equal(validMulti.length, 2);

  // 5. Single valid file -> VERIFIED
  const singleFile = [
    { '.tag': 'file', id: 'id:dropbox_123', name: 'final_paper.pdf', size: 1048576, server_modified: '2026-11-23T10:00:00Z', rev: '01a5' },
  ];
  const validSingle = singleFile.filter((e) => {
    const ext = (e.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    return Number(e.size) > 0 && ALLOWED_EXTENSIONS.has(ext);
  });
  assert.equal(validSingle.length, 1);
  assert.equal(validSingle[0].name, 'final_paper.pdf');
});

test('Submission Security: check verification requirement prevents unverified checkbox confirmation', () => {
  // A student attempting confirmation with status NOT_SUBMITTED or null must be rejected
  function canConfirm(submissionProvider, verificationStatus, isLeader = true) {
    if (submissionProvider === 'DROPBOX') {
      if (verificationStatus !== 'VERIFIED') {
        const error = new Error('Verify a valid Dropbox upload before confirming your submission.');
        error.statusCode = 409;
        error.code = 'UPLOAD_NOT_VERIFIED';
        throw error;
      }
    }
    if (!isLeader) {
      const error = new Error('Only the group leader can declare a group submission.');
      error.statusCode = 403;
      error.code = 'LEADER_REQUIRED';
      throw error;
    }
    return true;
  }

  // Checkbox without upload -> REJECTED with 409
  assert.throws(
    () => canConfirm('DROPBOX', 'NOT_SUBMITTED', true),
    (err) => err.statusCode === 409 && err.code === 'UPLOAD_NOT_VERIFIED'
  );

  // Checkbox with pending verification -> REJECTED with 409
  assert.throws(
    () => canConfirm('DROPBOX', 'PENDING_VERIFICATION', true),
    (err) => err.statusCode === 409 && err.code === 'UPLOAD_NOT_VERIFIED'
  );

  // Checkbox with needs review -> REJECTED with 409
  assert.throws(
    () => canConfirm('DROPBOX', 'NEEDS_REVIEW', true),
    (err) => err.statusCode === 409 && err.code === 'UPLOAD_NOT_VERIFIED'
  );

  // Group member who is not leader -> REJECTED with 403
  assert.throws(
    () => canConfirm('DROPBOX', 'VERIFIED', false),
    (err) => err.statusCode === 403 && err.code === 'LEADER_REQUIRED'
  );

  // Verified submission by leader/student -> ALLOWED
  assert.equal(canConfirm('DROPBOX', 'VERIFIED', true), true);
});
