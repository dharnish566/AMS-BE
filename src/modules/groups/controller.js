import { AppError } from '../../utils/appError.js';
import { createGroupSchema, invitationDecisionSchema, inviteMemberSchema, lookupStudentSchema } from './validation.js';
import { createGroup, getGroup, getMyGroup, getMyInvitations, inviteStudent, lookupStudent, removeGroupMember, respondToInvitation } from './service.js';
import { listGroupsForProfessor } from './repository.js';

function parse(schema, payload) { const result = schema.safeParse(payload); if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields and try again.'); return result.data; }
export async function create(req, res, next) { try { res.status(201).json({ group: await createGroup(req.auth.userId, parse(createGroupSchema, req.body)) }); } catch (error) { next(error); } }
export async function mine(req, res, next) { try { res.json({ group: await getMyGroup(req.auth.userId) }); } catch (error) { next(error); } }
export async function details(req, res, next) { try { res.json({ group: await getGroup(req.auth.userId, req.params.id) }); } catch (error) { next(error); } }
export async function invite(req, res, next) { try { res.status(201).json({ invitation: await inviteStudent(req.auth.userId, req.params.id, parse(inviteMemberSchema, req.body).identifier) }); } catch (error) { next(error); } }
export async function lookup(req, res, next) { try { res.json({ student: await lookupStudent(req.auth.userId, req.params.id, parse(lookupStudentSchema, req.query.identifier)) }); } catch (error) { next(error); } }
export async function invitations(req, res, next) { try { res.json({ invitations: await getMyInvitations(req.auth.userId) }); } catch (error) { next(error); } }
export async function respond(req, res, next) { try { res.json({ invitation: await respondToInvitation(req.auth.userId, req.params.id, parse(invitationDecisionSchema, req.body).status) }); } catch (error) { next(error); } }
export async function remove(req, res, next) { try { res.json({ member: await removeGroupMember(req.auth.userId, req.params.id, req.params.studentId) }); } catch (error) { next(error); } }
export async function listAll(req, res, next) { try { res.json({ groups: await listGroupsForProfessor() }); } catch (error) { next(error); } }
