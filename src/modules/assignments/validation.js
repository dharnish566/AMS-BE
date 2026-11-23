import { z } from 'zod';

const approvedHosts = ['onedrive.live.com', '1drv.ms', 'sharepoint.com'];
const oneDriveUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && approvedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}, 'Use a secure OneDrive or SharePoint URL.');
const dueAt = z.string().datetime({ offset: true }).refine((value) => new Date(value).getTime() > Date.now(), 'Deadline must be in the future.');

const assignmentFields = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(10_000),
  dueAt,
  onedriveUrl: oneDriveUrl,
  audienceType: z.enum(['ALL_STUDENTS', 'SELECTED_GROUPS']),
  groupIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

function validateAudience(value, context) {
  if (value.audienceType === 'SELECTED_GROUPS' && value.groupIds.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupIds'], message: 'Select at least one group.' });
  if (value.audienceType === 'ALL_STUDENTS' && value.groupIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupIds'], message: 'Groups are only used for selected-group assignments.' });
}

export const createAssignmentSchema = assignmentFields.superRefine(validateAudience);

export const updateAssignmentSchema = assignmentFields.partial().extend({ groupIds: z.array(z.string().uuid()).max(100).optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');
export const assignmentQuerySchema = z.object({ search: z.string().trim().max(100).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(), due: z.enum(['ALL', 'UPCOMING', 'OVERDUE']).optional() }).strict();
