import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssignmentSchema } from './validation.js';

const base = { title: 'OneDrive test assignment', description: 'Upload the completed work.', dueAt: '2099-01-01T12:00:00.000Z', audienceType: 'ALL_STUDENTS', groupIds: [] };

test('draft assignment input may omit a OneDrive URL', () => {
  const result = createAssignmentSchema.safeParse(base);
  assert.equal(result.success, true);
});

test('assignment input accepts approved HTTPS OneDrive and SharePoint hosts', () => {
  for (const onedriveUrl of ['https://onedrive.live.com/request/abc', 'https://1drv.ms/u/s!abc', 'https://college.sharepoint.com/sites/course/request']) {
    assert.equal(createAssignmentSchema.safeParse({ ...base, onedriveUrl }).success, true);
  }
});

test('assignment input rejects insecure and unapproved submission URLs', () => {
  for (const onedriveUrl of ['http://onedrive.live.com/request/abc', 'https://example.com/request/abc']) {
    assert.equal(createAssignmentSchema.safeParse({ ...base, onedriveUrl }).success, false);
  }
});

test('assignment input accepts Dropbox File Request URLs', () => {
  const result = createAssignmentSchema.safeParse({ ...base, submissionProvider: 'DROPBOX', submissionUrl: 'https://www.dropbox.com/request/abc' });
  assert.equal(result.success, true);
});

test('assignment input rejects Dropbox URLs when OneDrive is selected', () => {
  const result = createAssignmentSchema.safeParse({ ...base, submissionUrl: 'https://www.dropbox.com/request/abc' });
  assert.equal(result.success, false);
});
