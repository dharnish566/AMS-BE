import { z } from 'zod';

const providerHosts = { ONEDRIVE: ['onedrive.live.com', '1drv.ms', 'sharepoint.com'], DROPBOX: ['dropbox.com'] };
const submissionProvider = z.enum(['ONEDRIVE', 'DROPBOX']);
const submissionUrl = z.string().url().refine((value) => new URL(value).protocol === 'https:', 'Use a secure HTTPS submission URL.');
const dueAt = z.string().datetime({ offset: true }).refine((value) => new Date(value).getTime() > Date.now(), 'Deadline must be in the future.');

const assignmentFields = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(10_000),
  dueAt,
  submissionProvider: submissionProvider.default('ONEDRIVE'),
  submissionUrl: submissionUrl.optional(),
  onedriveUrl: submissionUrl.optional(),
  audienceType: z.enum(['ALL_STUDENTS', 'SELECTED_GROUPS']),
  groupIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

function hostAllowed(value, provider) {
  const hostname = new URL(value).hostname.toLowerCase();
  return providerHosts[provider].some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function validateSubmission(value, context) {
  const url = value.submissionUrl ?? value.onedriveUrl;
  if (value.submissionUrl && value.onedriveUrl && value.submissionUrl !== value.onedriveUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ['submissionUrl'], message: 'Provide one submission URL.' });
  if (url && !hostAllowed(url, value.submissionProvider)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['submissionUrl'], message: `Use a valid ${value.submissionProvider === 'DROPBOX' ? 'Dropbox' : 'OneDrive or SharePoint'} URL.` });
  if (value.submissionProvider === 'DROPBOX' && value.onedriveUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ['submissionProvider'], message: 'Use submissionUrl for Dropbox links.' });
}

function validateAudience(value, context) {
  if (value.audienceType === 'SELECTED_GROUPS' && value.groupIds.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupIds'], message: 'Select at least one group.' });
  if (value.audienceType === 'ALL_STUDENTS' && value.groupIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupIds'], message: 'Groups are only used for selected-group assignments.' });
}

export const createAssignmentSchema = assignmentFields.superRefine(validateSubmission).superRefine(validateAudience);
export const updateAssignmentSchema = assignmentFields.partial().extend({ groupIds: z.array(z.string().uuid()).max(100).optional() }).strict().superRefine(validateSubmission).refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');
export const assignmentQuerySchema = z.object({ search: z.string().trim().max(100).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(), due: z.enum(['ALL', 'UPCOMING', 'OVERDUE']).optional() }).strict();
