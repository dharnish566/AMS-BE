import { z } from 'zod';
import { AppError } from '../../utils/appError.js';
import { getAdminAnalytics, getAdminDashboard, getAdminSubmissions, getStudentDashboard } from './repository.js';
import { trackerQuerySchema } from './validation.js';

function adminOnly(req) { if (req.auth.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Professor access is required.'); }
export async function studentDashboard(req, res, next) {
    try { 
        if (req.auth.role !== 'STUDENT') 
            throw new AppError(403, 'FORBIDDEN', 'Student access is required.'); 
        res.json(await getStudentDashboard(req.auth.userId)); 
    } 
        catch (error) { 
            next(error); 
        } 
    }
export async function adminDashboard(req, res, next) { 
    try { 
        adminOnly(req); 
        res.json(await getAdminDashboard(req.auth.userId)); 
    } 
    catch (error) {
        next(error); 
    } 
}
export async function analytics(req, res, next) { 
    try { 
        adminOnly(req); 
        res.json(await getAdminAnalytics(req.auth.userId)); 
    } catch (error) { 
        next(error); 
    } 
}
export async function submissions(req, res, next) { 
    try { 
        adminOnly(req); 
        res.json(await getAdminSubmissions(req.auth.userId, trackerQuerySchema.parse(req.query))); 
    } 
    catch (error) { 
        if (error instanceof z.ZodError) 
            return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid tracker filters.')); 
        next(error); 
    } 
}
