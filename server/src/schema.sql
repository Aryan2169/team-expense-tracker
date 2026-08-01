-- Two related tables. Expenses reference categories; the FK is enforced
-- (see db.js: PRAGMA foreign_keys = ON) and deliberately RESTRICTs deletes.

CREATE TABLE IF NOT EXISTS categories (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- Nullable: a category may have no budget at all. Stored in cents.
  monthly_budget_cents INTEGER CHECK (monthly_budget_cents IS NULL OR monthly_budget_cents >= 0),
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Money is an integer number of cents, never a float: SUM() over REAL
  -- accumulates binary rounding error, and 0.1 + 0.2 != 0.3 in any language.
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description  TEXT NOT NULL CHECK (length(trim(description)) > 0),
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  -- SQLite has no date type. ISO 'YYYY-MM-DD' sorts and range-compares
  -- lexicographically, so BETWEEN can use the index below.
  spent_on     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Date-range filters and the summary's month window.
CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses(spent_on);
-- Category filter, with the date as a second key so a category+range scan
-- stays in the index.
CREATE INDEX IF NOT EXISTS idx_expenses_category_spent_on ON expenses(category_id, spent_on);
