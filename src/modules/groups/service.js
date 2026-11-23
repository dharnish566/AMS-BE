import { AppError } from '../../utils/appError.js';
import { createGroupWithLeader, createInvitation, findActiveGroupForStudent, findGroupDetails, findInvitee, findPendingInvitationsForStudent, isActiveMember, removeMember, decideInvitation } from './repository.js';

export async function createGroup(studentId, input) { return createGroupWithLeader({ name: input.name.trim(), leaderId: studentId }); }

export async function getMyGroup(studentId) { const group = await findActiveGroupForStudent(studentId); return group ? findGroupDetails(group.id) : null; }

export async function getGroup(studentId, groupId) {
  const group = await findGroupDetails(groupId);
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found.');
  if (!group.members.some((member) => member.student_id === studentId)) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this group.');
  return group;
}

export async function inviteStudent(studentId, groupId, identifier) {
  const group = await findGroupDetails(groupId);
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found.');
  if (group.leader_id !== studentId) throw new AppError(403, 'FORBIDDEN', 'Only the group leader can invite members.');
  if (group.activeMemberCount >= 5) throw new AppError(409, 'GROUP_FULL', 'This group has reached its maximum size of five.');
  const invitee = await findInvitee(identifier);
  if (!invitee) throw new AppError(404, 'STUDENT_NOT_FOUND', 'No registered student matches that email or student ID.');
  if (invitee.id === studentId) throw new AppError(400, 'INVALID_INVITEE', 'You cannot invite yourself.');
  if (await isActiveMember(groupId, invitee.id)) throw new AppError(409, 'ALREADY_MEMBER', 'That student is already an active member.');
  try { return await createInvitation({ groupId, inviteeId: invitee.id, invitedBy: studentId }); } catch (error) { if (error.code === '23505') throw new AppError(409, 'INVITATION_EXISTS', 'A pending invitation already exists for that student.'); throw error; }
}

export async function lookupStudent(studentId, groupId, identifier) {
  const group = await findGroupDetails(groupId);
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found.');
  if (group.leader_id !== studentId) throw new AppError(403, 'FORBIDDEN', 'Only the group leader can invite members.');
  if (group.activeMemberCount >= 5) throw new AppError(409, 'GROUP_FULL', 'This group has reached its maximum size of five.');
  const invitee = await findInvitee(identifier);
  if (!invitee) throw new AppError(404, 'STUDENT_NOT_FOUND', 'No registered student matches that email or student ID.');
  if (invitee.id === studentId) throw new AppError(400, 'INVALID_INVITEE', 'You cannot invite yourself.');
  if (await isActiveMember(groupId, invitee.id)) throw new AppError(409, 'ALREADY_MEMBER', 'That student is already an active member.');
  return invitee;
}

export async function getMyInvitations(studentId) { return findPendingInvitationsForStudent(studentId); }
export async function respondToInvitation(studentId, invitationId, status) { return decideInvitation({ invitationId, studentId, status }); }

export async function removeGroupMember(studentId, groupId, targetStudentId) {
  const group = await findGroupDetails(groupId);
  if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found.');
  if (group.leader_id !== studentId) throw new AppError(403, 'FORBIDDEN', 'Only the group leader can remove members.');
  if (studentId === targetStudentId) throw new AppError(400, 'LEADER_CANNOT_LEAVE', 'The group leader cannot remove themselves.');
  const removed = await removeMember({ groupId, studentId: targetStudentId });
  if (!removed) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Active group member not found.');
  return removed;
}
