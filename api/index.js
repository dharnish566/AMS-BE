import { createApp } from '../src/app.js';

// Vercel invokes this Express app as a serverless function. Do not call
// app.listen() here; Vercel owns the HTTP server.
export default createApp();
