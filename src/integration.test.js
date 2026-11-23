import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.js';

const canRun = process.env.RUN_DB_INTEGRATION === 'true'
  && Boolean(process.env.DATABASE_URL)
  && /test/i.test(process.env.DATABASE_URL);

test('complete student registration, login, group invitation, and dashboard flow', { skip: !canRun }, async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'Integration-Test-123!';
  const leader = { fullName: 'Integration Leader', email: `leader-${suffix}@test.joineazy.local`, studentId: `TEST-${suffix}-1`, password };
  const member = { fullName: 'Integration Member', email: `member-${suffix}@test.joineazy.local`, studentId: `TEST-${suffix}-2`, password };
  const request = (path, options = {}) => fetch(`${base}${path}`, { headers: { 'content-type': 'application/json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) }, ...options, body: options.body ? JSON.stringify(options.body) : undefined });
  try {
    const leaderRegistration = await request('/auth/register', { method: 'POST', body: leader });
    const memberRegistration = await request('/auth/register', { method: 'POST', body: member });
    assert.equal(leaderRegistration.status, 201);
    assert.equal(memberRegistration.status, 201);
    const leaderLogin = await request('/auth/login', { method: 'POST', body: { email: leader.email, password } });
    assert.equal(leaderLogin.status, 200);
    const leaderAuth = await leaderLogin.json();
    const groupResponse = await request('/groups', { method: 'POST', token: leaderAuth.accessToken, body: { name: `Integration Group ${suffix}` } });
    assert.equal(groupResponse.status, 201);
    const group = (await groupResponse.json()).group;
    const invitationResponse = await request(`/groups/${group.id}/invitations`, { method: 'POST', token: leaderAuth.accessToken, body: { identifier: member.studentId } });
    assert.equal(invitationResponse.status, 201);
    const memberLogin = await request('/auth/login', { method: 'POST', body: { email: member.email, password } });
    const memberAuth = await memberLogin.json();
    const invitationsResponse = await request('/invitations/me', { token: memberAuth.accessToken });
    const invitation = (await invitationsResponse.json()).invitations[0];
    const acceptance = await request(`/invitations/${invitation.id}`, { method: 'PATCH', token: memberAuth.accessToken, body: { status: 'ACCEPTED' } });
    assert.equal(acceptance.status, 200);
    const dashboard = await request('/student/dashboard', { token: memberAuth.accessToken });
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.json()).group.name, group.name);
  } finally {
    server.close();
  }
});
