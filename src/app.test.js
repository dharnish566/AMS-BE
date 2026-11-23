import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.js';
import { create, publish } from './modules/assignments/controller.js';

test('health endpoint is registered', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'joineazy-api' });
  } finally {
    server.close();
  }
});

test('protected auth endpoint rejects missing tokens', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required.' } });
  } finally {
    server.close();
  }
});

test('dashboard and analytics endpoints reject missing tokens', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const responses = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/student/dashboard`),
      fetch(`http://127.0.0.1:${port}/api/admin/dashboard`),
      fetch(`http://127.0.0.1:${port}/api/admin/analytics`),
      fetch(`http://127.0.0.1:${port}/api/admin/submissions`),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
  } finally {
    server.close();
  }
});

test('registration rejects weak passwords and client role escalation', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const weak = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fullName: 'Test Student', email: 'test@example.com', studentId: 'STU-1', password: 'weak', role: 'ADMIN' }) });
    assert.equal(weak.status, 400);
    assert.equal((await weak.json()).error.code, 'VALIDATION_ERROR');
  } finally {
    server.close();
  }
});

test('group and invitation APIs require an authenticated student', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const groupResponse = await fetch(`http://127.0.0.1:${port}/api/groups`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Study Group' }) });
    const invitationResponse = await fetch(`http://127.0.0.1:${port}/api/invitations/me`);
    assert.equal(groupResponse.status, 401);
    assert.equal(invitationResponse.status, 401);
  } finally {
    server.close();
  }
});

test('students cannot create or publish assignments', async () => {
  const errors = [];
  const request = { auth: { role: 'STUDENT', userId: '00000000-0000-0000-0000-000000000101' }, body: {} };
  await create(request, {}, (error) => errors.push(error));
  await publish({ ...request, params: { id: '00000000-0000-0000-0000-000000000301' } }, {}, (error) => errors.push(error));
  assert.deepEqual(errors.map((error) => [error.statusCode, error.code]), [[403, 'FORBIDDEN'], [403, 'FORBIDDEN']]);
});
