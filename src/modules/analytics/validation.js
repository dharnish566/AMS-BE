import { z } from 'zod';

export const trackerQuerySchema = z.object({ assignmentId: z.string().uuid().optional(), groupId: z.string().uuid().optional(), status: z.enum(['COMPLETED', 'COMPLETED_LATE', 'PENDING', 'OVERDUE']).optional(), due: z.enum(['UPCOMING', 'OVERDUE']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict();
