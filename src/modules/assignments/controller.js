import { AppError } from '../../utils/appError.js';
import { createAssignmentSchema, assignmentQuerySchema, updateAssignmentSchema } from './validation.js';
import { createProfessorAssignment, editAssignment, getForUser, listForUser, publishProfessorAssignment } from './service.js';

function parse(schema, value) { const result = schema.safeParse(value); if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the assignment fields and try again.'); return result.data; }
export async function create(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can create assignments.'); res.status(201).json({ assignment: await createProfessorAssignment(req.auth.userId, parse(createAssignmentSchema, req.body)) }); } catch (error) { next(error); } }
export async function list(req, res, next) { try { res.json({ assignments: await listForUser({ id: req.auth.userId, role: req.auth.role }, parse(assignmentQuerySchema, req.query)) }); } catch (error) { next(error); } }
export async function details(req, res, next) { try { res.json({ assignment: await getForUser(req.params.id, { id: req.auth.userId, role: req.auth.role }) }); } catch (error) { next(error); } }
export async function patch(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can edit assignments.'); res.json({ assignment: await editAssignment(req.auth.userId, req.params.id, parse(updateAssignmentSchema, req.body)) }); } catch (error) { next(error); } }
export async function publish(req, res, next) { try { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only professors can publish assignments.'); res.json({ assignment: await publishProfessorAssignment(req.auth.userId, req.params.id) }); } catch (error) { next(error); } }
