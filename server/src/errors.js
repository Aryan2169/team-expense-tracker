import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new ApiError(400, msg, extra);
export const notFound = (msg) => new ApiError(404, msg);
export const conflict = (msg, extra) => new ApiError(409, msg, extra);

// Single place where anything thrown in a route becomes a JSON response.
// Nothing here leaks a stack trace to the client.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.issues.map((i) => ({
          field: i.path.join('.') || '(body)',
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { message: err.message, ...err.extra } });
  }

  // SQLite constraint violations that slipped past validation - map the ones
  // a client can actually cause to 4xx instead of a blanket 500.
  if (err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({ error: { message: 'category_id does not exist' } });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: { message: 'That name is already taken' } });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_CHECK') {
    return res.status(400).json({ error: { message: 'Value violates a database constraint' } });
  }

  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error' } });
}
