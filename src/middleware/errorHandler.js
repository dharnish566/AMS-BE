export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` } });
}

export function errorHandler(err, req, res, _next) {
  const status = err.statusCode ?? 500;
  const message = status >= 500 ? 'An unexpected server error occurred.' : err.message;
  if (status >= 500) console.error(err.message);
  res.status(status).json({ error: { code: err.code ?? 'INTERNAL_ERROR', message } });
}
