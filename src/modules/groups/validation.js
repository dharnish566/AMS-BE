import { z } from 'zod';

export const createGroupSchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();
export const inviteMemberSchema = z.object({ identifier: z.string().trim().min(2).max(320) }).strict();
export const lookupStudentSchema = z.string().trim().min(2).max(320);
export const invitationDecisionSchema = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) }).strict();
