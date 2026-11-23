import assert from 'node:assert/strict';
import test from 'node:test';
import { requireRole } from './auth.js';

test('requireRole rejects a student for an admin resource', () => {
  let received;
  requireRole('ADMIN')({ auth: { role: 'STUDENT' } }, {}, (error) => { received = error; });
  assert.equal(received.statusCode, 403);
  assert.equal(received.code, 'FORBIDDEN');
});

test('requireRole permits an admin for an admin resource', () => {
  let called = false;
  requireRole('ADMIN')({ auth: { role: 'ADMIN' } }, {}, () => { called = true; });
  assert.equal(called, true);
});
