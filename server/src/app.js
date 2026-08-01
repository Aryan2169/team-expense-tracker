import cors from 'cors';
import express from 'express';
import { errorHandler } from './errors.js';
import { categoriesRouter } from './routes/categories.js';
import { expensesRouter } from './routes/expenses.js';
import { summaryRouter } from './routes/summary.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Every handler below is synchronous - better-sqlite3 has no async API - so
  // a thrown error reaches errorHandler without an async wrapper.
  app.use('/api/categories', categoriesRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/summary', summaryRouter);

  app.use((_req, res) => res.status(404).json({ error: { message: 'Not found' } }));
  app.use(errorHandler);

  return app;
}
