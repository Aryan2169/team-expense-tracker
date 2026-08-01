# Team Expense Tracker

A small full-stack app for logging a team's shared expenses, organising them by category, and seeing
a monthly spending summary with over-budget categories flagged.

**Stack:** Node.js + Express · SQLite (`better-sqlite3`) · React (Vite) · plain JavaScript, ESM.

No authentication — the app assumes a single team, as specified.

---

## Running it locally

Requires **Node 18+** (developed on Node 20). Nothing else — the database is a file that is created
and migrated on first run.

```bash
git clone <this repo>
cd team-expense-tracker

npm run setup     # installs server + client dependencies
npm run seed      # creates data.db and fills it with 6 categories / 120 expenses
npm run dev       # starts both processes
```

Then open **http://localhost:5173**.

| Process | Port | Notes |
|---|---|---|
| API | 3001 | `PORT` env var overrides it |
| Web | 5173 | Vite picks the next free port if 5173 is taken — check the console output |

Vite proxies `/api/*` to the API, so the frontend never needs a base URL and there is no CORS setup
in development.

Other scripts:

```bash
npm run reset     # wipes and reseeds the database
npm run dev --prefix server    # API only
npm run dev --prefix client    # web only
```

The SQLite file lives at `server/data.db` and is gitignored. Delete it and restart to get a clean
schema.

---

## Data model

Two related tables, with the foreign key actually enforced (`PRAGMA foreign_keys = ON` — it is off by
default in SQLite, which makes it easy to ship a schema whose constraints do nothing).

```
categories                          expenses
----------                          --------
id                    PK            id            PK
name                  UNIQUE        amount_cents  > 0
monthly_budget_cents  NULLable      description   non-empty
created_at                          category_id   FK -> categories(id) ON DELETE RESTRICT
                                    spent_on      'YYYY-MM-DD'
                                    created_at
```

Indexes: `expenses(spent_on)` for date-range filters, and `expenses(category_id, spent_on)` so a
category-plus-range query stays in one index.

**Money is stored as an integer number of cents.** Floating point money accumulates rounding error
under `SUM()`, and `0.1 + 0.2 !== 0.3` in any IEEE-754 language. Cents in, cents summed, divided by
100 only at the API boundary.

**Dates are `TEXT` in ISO `YYYY-MM-DD`.** SQLite has no date type; ISO strings sort and range-compare
lexicographically, so `spent_on BETWEEN ? AND ?` uses the index.

---

## API

All routes are under `/api`. Errors always come back as `{ "error": { "message": ..., "details": [...] } }`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/categories` | All categories, ordered by name |
| `POST` | `/categories` | `{ name, monthly_budget? }` → `201`. Duplicate name → `409` |
| `PATCH` | `/categories/:id` | Rename and/or change budget |
| `DELETE` | `/categories/:id` | See the delete policy below |
| `GET` | `/expenses` | Filters: `category_id`, `from`, `to`. Paging: `limit` (default 25, max 100), `offset` |
| `POST` | `/expenses` | `{ amount, description, category_id, date }` → `201` |
| `PATCH` | `/expenses/:id` | Partial update, same validation rules |
| `DELETE` | `/expenses/:id` | `204` |
| `GET` | `/summary` | `?month=YYYY-MM` (defaults to the current month), or an explicit `?from=&to=` |
| `GET` | `/health` | `{ ok: true }` |

`GET /expenses` responds with the page plus its total, so the UI can render page counts without a
second request:

```json
{ "data": [ … ], "page": { "limit": 25, "offset": 0, "total": 120 } }
```

---

## The four things the brief singled out

### 1. Input is validated on the server

All validation lives in [`server/src/validation.js`](server/src/validation.js) (zod) and runs
regardless of what the UI sends. The form deliberately does **no** client-side checking beyond the
browser's native `date` input — one set of rules, and the messages the user sees are the server's.

Rejected, with a `400` and a field-level message:

| Input | Result |
|---|---|
| `amount: -5` or `amount: 0` | `amount must be greater than 0` |
| `amount: "10.999"` | `amount must have at most 2 decimal places` |
| missing `description` | `description is required` |
| `date: "2026-02-30"` | `date must be a real calendar date in YYYY-MM-DD format` |
| `category_id: 9999` | `category_id does not exist` |
| `from` after `to` | `from must be on or before to` |

Two details worth pointing out:

- `new Date('2026-02-30')` does **not** throw — it silently rolls over to March 2nd. A regex alone
  isn't enough, so parsed dates are round-tripped and required to come back identical.
- Amounts are converted with `Math.round(n * 100)`, not truncation: `19.99 * 100` is
  `1998.9999999999998` in IEEE-754, and truncating would quietly charge the team a cent less.

### 2. Summary totals are aggregated in SQL

One `GROUP BY` in [`server/src/routes/summary.js`](server/src/routes/summary.js) produces the totals,
the counts, **and** the over-budget flag. No expense rows are ever fetched to be summed in JavaScript.

```sql
SELECT c.id, c.name, c.monthly_budget_cents,
       COALESCE(SUM(e.amount_cents), 0) AS total_cents,
       COUNT(e.id)                      AS expense_count,
       CASE WHEN c.monthly_budget_cents IS NOT NULL
             AND COALESCE(SUM(e.amount_cents), 0) > c.monthly_budget_cents
            THEN 1 ELSE 0 END           AS over_budget
FROM categories c
LEFT JOIN expenses e
  ON e.category_id = c.id AND e.spent_on >= @from AND e.spent_on <= @to
GROUP BY c.id, c.name, c.monthly_budget_cents
ORDER BY total_cents DESC
```

- It's a `LEFT JOIN` with the date window in the **`ON`** clause, not `WHERE`. In `WHERE` the join
  filters away categories with no spend in that month, so they'd vanish from the summary instead of
  showing `$0.00` — usually the row you most want to see.
- The window **defaults to the current month**, because the budget is a *monthly* budget. Comparing
  an all-time total against a monthly budget would flag every category as over, eventually, and mean
  nothing.

### 3. Deleting a category that still has expenses

The foreign key is `ON DELETE RESTRICT`, and the API makes the choice explicit rather than guessing:

```
DELETE /api/categories/3                 → 409 { message, expense_count: 15 }
DELETE /api/categories/3?reassign_to=6   → 204, expenses moved first
```

The reassign-and-delete runs inside a single transaction: either the expenses move and the category
goes, or nothing changes.

**Why not the alternatives?**

- `ON DELETE CASCADE` destroys spend history as a side effect of a rename-gone-wrong. Deleting a
  category is a taxonomy change; it should never delete money that was actually spent.
- `ON DELETE SET NULL` leaves uncategorised expenses that then have to be special-cased in every
  query, and puts a hole in the per-category summary — the totals stop adding up to the real total.
- Refusing outright, with a count and a way through, keeps the destructive decision with the person
  who has the context. The UI turns the `409` into "15 expenses use this category — move them to […]
  or cancel."

### 4. The list view never returns everything

`GET /expenses` is always paginated: default 25, hard maximum 100, and an out-of-range `limit` is
clamped rather than honoured. There is no "return all rows" mode. The response carries the matching
`total` from a second `COUNT(*)` built from the same `WHERE` clause, so the page query and the count
can't drift apart. The UI pages at 10 rows and resets to page 1 whenever a filter changes.

---

## Project layout

```
server/src/
  schema.sql        tables + indexes (applied on startup)
  db.js             connection, PRAGMAs, migration
  validation.js     every input rule, in one file
  errors.js         ApiError + the single error->JSON handler
  routes/           categories.js, expenses.js, summary.js
  seed.js           deterministic demo data

client/src/
  api.js            fetch wrapper; turns error payloads into thrown Errors
  App.jsx           tabs + shared category state
  components/       ExpensesTab, ExpenseForm, ExpenseFilters, ExpenseTable,
                    Pagination, CategoryManager, SummaryView
```

Styling is intentionally minimal — the brief says it isn't evaluated.

---

## Suggested demo walkthrough

1. **Expenses** — 120 seeded rows, 10 per page; step through a couple of pages.
2. Filter by category, then by a date range; note the row count and page count change.
3. Add an expense with a negative amount → the server's validation message appears.
4. Fix it and add it for real; edit a row inline; delete one.
5. **Categories** — add one with a budget, then try to delete a category that's in use → the app
   explains why it can't and offers to move the expenses.
6. **Summary** — over-budget categories flagged; switch months to see the totals change.

See [NOTES.md](NOTES.md) for the reflection questions.
