import { Router } from 'express';
import { db } from '../db.js';
import { notFound } from '../errors.js';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from '../validation.js';

export const expensesRouter = Router();

const toApi = (row) => ({
  id: row.id,
  amount: row.amount_paise / 100,
  amount_paise: row.amount_paise,
  description: row.description,
  category_id: row.category_id,
  category_name: row.category_name,
  date: row.spent_on,
  created_at: row.created_at,
});

const selectOne = db.prepare(`
  SELECT e.*, c.name AS category_name
  FROM expenses e JOIN categories c ON c.id = e.category_id
  WHERE e.id = ?
`);

/** Builds the WHERE clause once so the page query and the count query can't drift apart. */
function buildFilter({ category_id, from, to }) {
  const clauses = [];
  const params = [];
  if (category_id !== undefined) {
    clauses.push('e.category_id = ?');
    params.push(category_id);
  }
  if (from !== undefined) {
    clauses.push('e.spent_on >= ?');
    params.push(from);
  }
  if (to !== undefined) {
    clauses.push('e.spent_on <= ?');
    params.push(to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/**
 * GET /api/expenses
 *
 * Always paginated - there is no "give me everything" mode. The response
 * carries the total so the UI can render page counts without a second call.
 */
expensesRouter.get('/', (req, res) => {
  const query = listExpensesQuerySchema.parse(req.query);
  const { where, params } = buildFilter(query);

  const rows = db
    .prepare(
      `SELECT e.*, c.name AS category_name
       FROM expenses e JOIN categories c ON c.id = e.category_id
       ${where}
       ORDER BY e.spent_on DESC, e.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, query.limit, query.offset);

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM expenses e ${where}`)
    .get(...params);

  res.json({
    data: rows.map(toApi),
    page: { limit: query.limit, offset: query.offset, total },
  });
});

expensesRouter.post('/', (req, res) => {
  const { amount, description, category_id, date } = createExpenseSchema.parse(req.body ?? {});
  // A non-existent category_id trips the FK and is turned into a 400 by the
  // error handler, so there is no read-then-write race here.
  const info = db
    .prepare(
      'INSERT INTO expenses (amount_paise, description, category_id, spent_on) VALUES (?, ?, ?, ?)',
    )
    .run(amount, description, category_id, date);
  res.status(201).json({ data: toApi(selectOne.get(info.lastInsertRowid)) });
});

expensesRouter.patch('/:id', (req, res) => {
  const existing = selectOne.get(req.params.id);
  if (!existing) throw notFound('Expense not found');

  const patch = updateExpenseSchema.parse(req.body ?? {});
  db.prepare(
    'UPDATE expenses SET amount_paise = ?, description = ?, category_id = ?, spent_on = ? WHERE id = ?',
  ).run(
    patch.amount ?? existing.amount_paise,
    patch.description ?? existing.description,
    patch.category_id ?? existing.category_id,
    patch.date ?? existing.spent_on,
    existing.id,
  );
  res.json({ data: toApi(selectOne.get(existing.id)) });
});

expensesRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  if (info.changes === 0) throw notFound('Expense not found');
  res.status(204).end();
});
