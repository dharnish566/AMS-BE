import { AppError } from '../../utils/appError.js';
import { createAssignmentSchema, assignmentQuerySchema, updateAssignmentSchema } from './validation.js';
import { createProfessorAssignment, editAssignment, getForUser, listForUser, publishProfessorAssignment } from './service.js';
import { createAssignmentRequests } from '../dropbox/service.js';
import { findOwnedAssignment } from './repository.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.errors.map((e) => e.message).filter(Boolean).join('. ');
    throw new AppError(400, 'VALIDATION_ERROR', detail || 'Please check the assignment fields and try again.');
  }
  return result.data;
}
export async function create(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can create assignments.'); res.status(201).json({ assignment: await createProfessorAssignment(req.auth.userId, parse(createAssignmentSchema, req.body)) }); } catch (error) { next(error); } }
export async function list(req, res, next) { try { res.json({ assignments: await listForUser({ id: req.auth.userId, role: req.auth.role }, parse(assignmentQuerySchema, req.query)) }); } catch (error) { next(error); } }
export async function details(req, res, next) { try { res.json({ assignment: await getForUser(req.params.id, { id: req.auth.userId, role: req.auth.role }) }); } catch (error) { next(error); } }
export async function patch(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can edit assignments.'); res.json({ assignment: await editAssignment(req.auth.userId, req.params.id, parse(updateAssignmentSchema, req.body)) }); } catch (error) { next(error); } }
export async function publish(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can publish assignments.'); res.json({ assignment: await publishProfessorAssignment(req.auth.userId, req.params.id) }); } catch (error) { next(error); } }
export async function dropboxRequest(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can manage assignment requests.'); const assignment = await findOwnedAssignment(req.params.id, req.auth.userId); if (!assignment) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.'); res.json({ requests: await createAssignmentRequests({ assignment, professorId: req.auth.userId }) }); } catch (error) { next(error); } }
