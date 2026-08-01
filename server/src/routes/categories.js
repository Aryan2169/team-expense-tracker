import { Router } from 'express';
import { db } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { createCategorySchema, updateCategorySchema } from '../validation.js';

export const categoriesRouter = Router();

const toApi = (row) => ({
  id: row.id,
  name: row.name,
  monthly_budget:
    row.monthly_budget_cents === null ? null : row.monthly_budget_cents / 100,
  monthly_budget_cents: row.monthly_budget_cents,
  created_at: row.created_at,
});

const selectAll = db.prepare('SELECT * FROM categories ORDER BY name COLLATE NOCASE');
const selectOne = db.prepare('SELECT * FROM categories WHERE id = ?');
const countExpenses = db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?');

categoriesRouter.get('/', (_req, res) => {
  res.json({ data: selectAll.all().map(toApi) });
});

categoriesRouter.post('/', (req, res) => {
  const { name, monthly_budget } = createCategorySchema.parse(req.body ?? {});
  const info = db
    .prepare('INSERT INTO categories (name, monthly_budget_cents) VALUES (?, ?)')
    .run(name, monthly_budget);
  res.status(201).json({ data: toApi(selectOne.get(info.lastInsertRowid)) });
});

categoriesRouter.patch('/:id', (req, res) => {
  const existing = selectOne.get(req.params.id);
  if (!existing) throw notFound('Category not found');

  const patch = updateCategorySchema.parse(req.body ?? {});
  const next = {
    name: patch.name ?? existing.name,
    monthly_budget_cents:
      'monthly_budget' in patch ? patch.monthly_budget : existing.monthly_budget_cents,
  };
  db.prepare('UPDATE categories SET name = ?, monthly_budget_cents = ? WHERE id = ?').run(
    next.name,
    next.monthly_budget_cents,
    existing.id,
  );
  res.json({ data: toApi(selectOne.get(existing.id)) });
});

/**
 * Deleting a category that still has expenses.
 *
 * The schema uses ON DELETE RESTRICT, so this can never silently destroy spend
 * history (CASCADE) or orphan rows (SET NULL, which would also punch a hole in
 * the per-category summary). A plain delete on a category still in use answers
 * 409 with the count, and the caller decides:
 *
 *   DELETE /api/categories/3                 -> 409 { expense_count: 12 }
 *   DELETE /api/categories/3?reassign_to=5   -> moves those 12, then deletes
 *
 * Reassign + delete run in one transaction: either the expenses move and the
 * category goes, or nothing changes.
 */
categoriesRouter.delete('/:id', (req, res) => {
  const category = selectOne.get(req.params.id);
  if (!category) throw notFound('Category not found');

  const { n: inUse } = countExpenses.get(category.id);
  const reassignTo = req.query.reassign_to;

  if (inUse === 0 && reassignTo === undefined) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
    return res.status(204).end();
  }

  if (reassignTo === undefined) {
    throw conflict(
      `This category is used by ${inUse} expense${inUse === 1 ? '' : 's'}. ` +
        'Reassign them to another category to delete it.',
      { expense_count: inUse },
    );
  }

  const target = selectOne.get(reassignTo);
  if (!target) throw badRequest('reassign_to must be an existing category id');
  if (target.id === category.id) throw badRequest('reassign_to must be a different category');

  const moveAndDelete = db.transaction(() => {
    db.prepare('UPDATE expenses SET category_id = ? WHERE category_id = ?').run(
      target.id,
      category.id,
    );
    db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
  });
  moveAndDelete();

  res.status(204).end();
});
