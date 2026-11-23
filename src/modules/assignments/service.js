import { AppError } from '../../utils/appError.js';
import {
  createAssignment as insertAssignment,
  findAssignmentForUser,
  findGroupsByIds,
  findOwnedAssignment,
  listAssignments,
  populateAssignmentTargets,
  publishAssignment as publish,
  updateAssignment as update,
} from './repository.js';

async function validateGroups(input) {
  if (input.audienceType !== 'SELECTED_GROUPS') return [];
  const uniqueIds = [...new Set(input.groupIds ?? [])];
  if (!uniqueIds.length) {
    throw new AppError(400, 'GROUPS_REQUIRED', 'Select at least one group.');
  }
  const groups = await findGroupsByIds(uniqueIds);
  if (groups.length !== uniqueIds.length) {
    throw new AppError(400, 'INVALID_GROUPS', 'One or more selected groups could not be found.');
  }
  return groups;
}

export async function createProfessorAssignment(professorId, input) {
  return insertAssignment({ professorId, input, groups: await validateGroups(input) });
}

export async function listForUser(user, query) {
  return listAssignments({ role: user.role, userId: user.id, query });
}

export async function getForUser(assignmentId, user) {
  const assignment = await findAssignmentForUser(assignmentId, { role: user.role, userId: user.id });
  if (!assignment) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  }
  return assignment;
}

export async function editAssignment(professorId, assignmentId, input) {
  const current = await findOwnedAssignment(assignmentId, professorId);
  if (!current) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  }
  if (input.audienceType === 'SELECTED_GROUPS') await validateGroups(input);
  if (current.status !== 'DRAFT' && input.audienceType && input.audienceType !== current.audience_type) {
    throw new AppError(409, 'AUDIENCE_IMMUTABLE', 'Assignment audience cannot change after publication.');
  }
  const updateInput = current.status !== 'DRAFT' ? { ...input, audienceType: undefined, groupIds: undefined } : input;
  return update(assignmentId, professorId, updateInput);
}

export async function publishProfessorAssignment(professorId, assignmentId) {
  const draft = await findOwnedAssignment(assignmentId, professorId);
  if (!draft) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  }
  if (draft.status !== 'DRAFT') {
    throw new AppError(409, 'ALREADY_PUBLISHED', 'Only draft assignments can be published.');
  }

  if (draft.submission_provider === 'DROPBOX') {
    const { connectionStatus, createAssignmentRequests } = await import('../dropbox/service.js');
    const connection = await connectionStatus(professorId);
    if (!connection.connected) {
      throw new AppError(409, 'DROPBOX_CONNECTION_REQUIRED', 'Connect Dropbox before publishing a Dropbox assignment.');
    }
    // Prepare recipient targets before making the external Dropbox call so requests map correctly
    await populateAssignmentTargets(assignmentId);
    await createAssignmentRequests({ assignment: draft, professorId });
  }

  const assignment = await publish(assignmentId, professorId);
  return assignment;
}
