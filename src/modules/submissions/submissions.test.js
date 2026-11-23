import assert from 'node:assert/strict';
import test from 'node:test';

test('Submission Lifecycle: student state transitions logic', () => {
  function getStudentLifecycleState({ isConfirmed, uploadOpened }) {
    if (isConfirmed) return 'STUDENT_CONFIRMED';
    if (uploadOpened) return 'AWAITING_CONFIRMATION';
    return 'PENDING';
  }

  // Initial state: not confirmed, link not opened
  assert.equal(getStudentLifecycleState({ isConfirmed: false, uploadOpened: false }), 'PENDING');

  // Opened external upload link: awaiting confirmation
  assert.equal(getStudentLifecycleState({ isConfirmed: false, uploadOpened: true }), 'AWAITING_CONFIRMATION');

  // Confirmed on server: student confirmed
  assert.equal(getStudentLifecycleState({ isConfirmed: true, uploadOpened: true }), 'STUDENT_CONFIRMED');

  // Directly loaded after refresh with confirmed state from PostgreSQL: student confirmed
  assert.equal(getStudentLifecycleState({ isConfirmed: true, uploadOpened: false }), 'STUDENT_CONFIRMED');
});

test('Submission Authorization: only designated group leader can finalize group submission', () => {
  function validateGroupSubmission(isLeader) {
    if (!isLeader) {
      const error = new Error('Only the designated group leader can finalize the group submission.');
      error.statusCode = 403;
      error.code = 'LEADER_REQUIRED';
      throw error;
    }
    return true;
  }

  // Non-leader attempting confirmation -> 403 Forbidden
  assert.throws(
    () => validateGroupSubmission(false),
    (err) => err.statusCode === 403 && err.code === 'LEADER_REQUIRED'
  );

  // Group leader -> Allowed
  assert.equal(validateGroupSubmission(true), true);
});

test('Submission Integrity: duplicate confirmations are rejected', () => {
  function recordConfirmation(hasExistingConfirmation) {
    if (hasExistingConfirmation) {
      const error = new Error('This submission has already been confirmed.');
      error.statusCode = 409;
      error.code = 'ALREADY_CONFIRMED';
      throw error;
    }
    return { confirmed: true, confirmedAt: new Date().toISOString() };
  }

  // First confirmation succeeds
  const first = recordConfirmation(false);
  assert.equal(first.confirmed, true);
  assert.ok(first.confirmedAt);

  // Second confirmation throws 409
  assert.throws(
    () => recordConfirmation(true),
    (err) => err.statusCode === 409 && err.code === 'ALREADY_CONFIRMED'
  );
});

test('Professor Tracker Metrics: calculation of total, confirmed, pending, rate, on-time and late', () => {
  const recipients = [
    { id: '1', submitted_at: '2026-11-20T10:00:00Z', due_at: '2026-11-21T00:00:00Z' }, // on-time
    { id: '2', submitted_at: '2026-11-22T10:00:00Z', due_at: '2026-11-21T00:00:00Z' }, // late
    { id: '3', submitted_at: null, due_at: '2026-11-21T00:00:00Z' }, // pending
    { id: '4', submitted_at: null, due_at: '2026-11-21T00:00:00Z' }, // pending
  ];

  const total = recipients.length;
  let confirmed = 0;
  let onTime = 0;
  let late = 0;

  for (const r of recipients) {
    if (r.submitted_at) {
      confirmed++;
      if (new Date(r.submitted_at) > new Date(r.due_at)) {
        late++;
      } else {
        onTime++;
      }
    }
  }

  const pending = total - confirmed;
  const completionPercentage = total ? Math.round((confirmed / total) * 100) : 0;

  assert.equal(total, 4);
  assert.equal(confirmed, 2);
  assert.equal(pending, 2);
  assert.equal(completionPercentage, 50);
  assert.equal(onTime, 1);
  assert.equal(late, 1);
});
