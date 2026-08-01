import { Router } from 'express';
import { db } from '../db.js';
import { currentMonth, monthBounds, summaryQuerySchema } from '../validation.js';

export const summaryRouter = Router();

/**
 * One grouped query does all the work - totals, counts, and the over-budget
 * flag. Nothing here fetches rows to add them up in JavaScript.
 *
 * Two details worth knowing:
 *  - LEFT JOIN, with the date window in the ON clause rather than WHERE. Moving
 *    it to WHERE would drop categories with no spend in the window instead of
 *    showing them at 0.00, which is exactly the row you want to see.
 *  - The window defaults to the current month, because the budget is a *monthly*
 *    budget. Comparing an all-time total against a monthly budget would flag
 *    every category as over eventually and mean nothing.
 */
const summaryQuery = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.monthly_budget_paise,
    COALESCE(SUM(e.amount_paise), 0) AS total_paise,
    COUNT(e.id)                      AS expense_count,
    CASE
      WHEN c.monthly_budget_paise IS NOT NULL
       AND COALESCE(SUM(e.amount_paise), 0) > c.monthly_budget_paise
      THEN 1 ELSE 0
    END AS over_budget
  FROM categories c
  LEFT JOIN expenses e
    ON e.category_id = c.id
   AND e.spent_on >= @from
   AND e.spent_on <= @to
  GROUP BY c.id, c.name, c.monthly_budget_paise
  ORDER BY total_paise DESC, c.name COLLATE NOCASE
`);

summaryRouter.get('/', (req, res) => {
  const q = summaryQuerySchema.parse(req.query);

  // Explicit from/to wins; otherwise the named (or current) month.
  const range =
    q.from || q.to
      ? { from: q.from ?? '0000-01-01', to: q.to ?? '9999-12-31' }
      : monthBounds(q.month ?? currentMonth());

  const rows = summaryQuery.all(range);

  // Adding up the already-aggregated per-category rows (one row per category,
  // dozens at most) - not the expense rows, which never leave the database.
  const totalPaise = rows.reduce((sum, r) => sum + r.total_paise, 0);

  res.json({
    range,
    month: q.from || q.to ? null : (q.month ?? currentMonth()),
    total_spend: totalPaise / 100,
    total_spend_paise: totalPaise,
    data: rows.map((r) => ({
      category_id: r.id,
      name: r.name,
      total: r.total_paise / 100,
      total_paise: r.total_paise,
      expense_count: r.expense_count,
      monthly_budget: r.monthly_budget_paise === null ? null : r.monthly_budget_paise / 100,
      monthly_budget_paise: r.monthly_budget_paise,
      over_budget: r.over_budget === 1,
      remaining:
        r.monthly_budget_paise === null
          ? null
          : (r.monthly_budget_paise - r.total_paise) / 100,
    })),
  });
});
