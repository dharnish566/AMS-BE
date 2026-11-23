import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../../app.js';
import { connect, disconnect, status, sync } from './controller.js';
import {
  confirmation,
  getMySubmission,
  getSubmissions,
  handleConfirmSubmission,
  review,
  verify,
} from '../submissions/controller.js';

test('Dropbox HTTP Endpoints: unauthenticated requests are rejected with 401', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  try {
    const responses = await Promise.all([
      fetch(`${base}/integrations/dropbox/status`),
      fetch(`${base}/integrations/dropbox/connect`),
      fetch(`${base}/integrations/dropbox/disconnect`, { method: 'POST' }),
      fetch(`${base}/integrations/dropbox/sync`, { method: 'POST' }),
      fetch(`${base}/assignments/00000000-0000-0000-0000-000000000001/verify-upload`, { method: 'POST' }),
      fetch(`${base}/assignments/00000000-0000-0000-0000-000000000001/confirm-submission`, { method: 'POST' }),
      fetch(`${base}/assignments/00000000-0000-0000-0000-000000000001/my-submission`),
      fetch(`${base}/assignments/00000000-0000-0000-0000-000000000001/submissions`),
      fetch(`${base}/assignments/00000000-0000-0000-0000-000000000001/submissions/00000000-0000-0000-0000-000000000002/review`, { method: 'POST' }),
    ]);

    for (const res of responses) {
      assert.equal(res.status, 401, `Expected 401 for ${res.url}, got ${res.status}`);
    }
  } finally {
    server.close();
  }
});

test('Dropbox Role Authorization: students cannot manage Dropbox', async () => {
  const studentReq = { auth: { userId: '00000000-0000-0000-0000-000000000001', role: 'STUDENT' } };

  let statusErr;
  await status(studentReq, {}, (err) => { statusErr = err; });
  assert.equal(statusErr?.statusCode, 403);
  assert.equal(statusErr?.code, 'FORBIDDEN');

  let connectErr;
  await connect(studentReq, {}, (err) => { connectErr = err; });
  assert.equal(connectErr?.statusCode, 403);
  assert.equal(connectErr?.code, 'FORBIDDEN');

  let disconnectErr;
  await disconnect(studentReq, {}, (err) => { disconnectErr = err; });
  assert.equal(disconnectErr?.statusCode, 403);
  assert.equal(disconnectErr?.code, 'FORBIDDEN');

  let syncErr;
  await sync(studentReq, {}, (err) => { syncErr = err; });
  assert.equal(syncErr?.statusCode, 403);
  assert.equal(syncErr?.code, 'FORBIDDEN');
});

test('Submission Role Authorization: professors cannot verify/confirm as students, students cannot review', async () => {
  const adminReq = {
    auth: { userId: '00000000-0000-0000-0000-000000000002', role: 'ADMIN' },
    params: { id: '00000000-0000-0000-0000-000000000003' },
  };
  const studentReq = {
    auth: { userId: '00000000-0000-0000-0000-000000000001', role: 'STUDENT' },
    params: { id: '00000000-0000-0000-0000-000000000003', submissionId: '00000000-0000-0000-0000-000000000004' },
    body: { decision: 'VERIFIED' },
  };

  let verifyErr;
  await verify(adminReq, {}, (err) => { verifyErr = err; });
  assert.equal(verifyErr?.statusCode, 403);
  assert.equal(verifyErr?.code, 'FORBIDDEN');

  let confirmErr;
  await handleConfirmSubmission(adminReq, {}, (err) => { confirmErr = err; });
  assert.equal(confirmErr?.statusCode, 403);
  assert.equal(confirmErr?.code, 'FORBIDDEN');

  let mySubErr;
  await getMySubmission(adminReq, {}, (err) => { mySubErr = err; });
  assert.equal(mySubErr?.statusCode, 403);
  assert.equal(mySubErr?.code, 'FORBIDDEN');

  let reviewErr;
  await review(studentReq, {}, (err) => { reviewErr = err; });
  assert.equal(reviewErr?.statusCode, 403);
  assert.equal(reviewErr?.code, 'FORBIDDEN');

  let trackerErr;
  await getSubmissions(studentReq, {}, (err) => { trackerErr = err; });
  assert.equal(trackerErr?.statusCode, 403);
  assert.equal(trackerErr?.code, 'FORBIDDEN');
});
