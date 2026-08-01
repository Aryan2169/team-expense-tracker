# NOTES

## 1. Which parts did you build with AI assistance, and where did you have to correct, override, or rewrite what it produced?

I used AI assistance for most of the typing: the Express/Vite scaffolding, the React components, the
CSS, and the seed script. I made the decisions that actually matter — the schema, the money
representation, the category-delete policy, the pagination contract, and where validation lives — and
then reviewed everything that came back.

The things I had to correct:

- **Pagination limit clamping was silently wrong.** The first version validated `limit` with
  `.min(1).max(100).catch(25)`, which reads fine but means `?limit=9999` falls all the way back to
  the *default* of 25 instead of being clamped to the maximum of 100. Rejecting and defaulting are
  not the same as clamping. Replaced with an explicit
  `.catch(25).transform(n => Math.min(Math.max(n, 1), 100))`.
- **Validation messages for a completely empty body were useless.** The generated zod schemas
  produced `"Invalid input"` for `amount` and `"Expected number, received nan"` for `category_id` —
  internal type-checker language leaking to the client. I added explicit error maps so the API says
  `amount is required and must be a number`.
- **Two UI bugs that only showed up when I actually looked at the rendered page.** A global `button`
  rule set `color: #fff`, which the inactive tab buttons inherited on top of a white background —
  they rendered as blank white rectangles. And `toLocaleString(undefined, …)` formats against
  whatever locale the *viewer's* browser reports, so the same amount renders differently on different
  machines; pinning it to `en-IN` fixed that and got lakh grouping (`₹1,23,456.00`) as well. Neither
  breaks a build or a test; both are obvious in a screenshot.
- **The seed data didn't demonstrate the feature it exists for.** The first pass produced 81 rows and
  budgets that no category actually exceeded, so the over-budget flag — the one part of the summary
  the brief specifically asks for — was invisible on a fresh install. I retuned the per-month counts
  and the budgets so 120 rows land across three months and some categories reliably end the month
  over while others stay inside.

The date validation was a case where I decided up front rather than corrected after: `new Date('2026-02-30')`
doesn't throw, it rolls over to March 2nd, so the check round-trips the parsed date and requires it
to come back identical.

## 2. Briefly describe your database schema and one tradeoff you made in designing it.

Two tables. `categories` has `id`, a unique `name`, and a nullable `monthly_budget_paise`.
`expenses` has `id`, `amount_paise`, `description`, a `category_id` foreign key, and `spent_on` as an
ISO `YYYY-MM-DD` string. Indexes on `expenses(spent_on)` and `expenses(category_id, spent_on)` cover
the date-range and category filters. `PRAGMA foreign_keys = ON` at startup, since SQLite otherwise
ignores foreign keys entirely and the `ON DELETE RESTRICT` in my schema would be decorative.

**The tradeoff: money is an integer number of paise, not a decimal or a float.** SQLite has no
`DECIMAL` type — it would store `REAL`, and floating-point money accumulates rounding error under
`SUM()`. Integer paise makes aggregation exact and comparison against a budget trivial. The cost is
that every boundary has to convert: the API divides by 100 on the way out and rounds on the way in,
and anyone querying the database directly sees `2197660` where they expect `21,976.60`. I think
that's the right trade — the conversion is two lines in one place, whereas float drift is a bug you
find in production, in someone's expense report.

A second, smaller tradeoff: `category_id` is `NOT NULL`, so there is no "uncategorised" bucket. That
keeps the summary honest — per-category totals always add up to the overall total — but it's what
forces the reassign flow in question 3 of the delete policy, rather than letting a delete just null
the column out.

## 3. What would break first if this app had to handle ~1,000,000 expenses, and what would you change?

Roughly in the order they'd hurt:

1. **`OFFSET` pagination.** `LIMIT 10 OFFSET 900000` makes SQLite walk and discard 900,000 rows to
   return ten. Page 1 stays fast forever and page 90,000 gets slower the deeper you go. I'd switch to
   keyset (cursor) pagination on `(spent_on, id)` — `WHERE (spent_on, id) < (?, ?) ORDER BY spent_on
   DESC, id DESC LIMIT ?` — which is index-seek-then-scan and costs the same on every page. The API
   would return an opaque cursor instead of an offset; the price is losing "jump to page 40", which
   nobody does anyway.
2. **The `COUNT(*)` I run alongside every list request.** It scans the whole matching set just to
   print "of 1,000,000", on every filter change. I'd drop the exact total from the default response
   and return a `has_more` boolean (fetch `limit + 1` rows and check), keeping an exact count behind
   an explicit opt-in, or serving an approximate/cached one.
3. **The summary aggregation.** One month of a million-expense dataset is tens of thousands of rows
   summed on every page load. First fix is cheap: a covering index on
   `(category_id, spent_on, amount_paise)` so the `GROUP BY` is index-only and never touches the
   table. If that isn't enough, a `monthly_category_totals` rollup table maintained on write (or by a
   trigger) turns the summary into a handful of row reads — at the cost of having to keep the rollup
   correct through edits, deletes, and category reassignment.
4. **SQLite's single writer.** WAL mode gives concurrent readers, but writes serialise. Fine for one
   team; not fine for a whole company logging expenses at once. That's the point where I'd move to
   PostgreSQL — the schema ports almost unchanged, with `NUMERIC(12,2)` or `BIGINT` paise and a real
   `DATE` type.

Also worth naming, though further out: the frontend loads every category to populate its dropdowns,
which is fine at dozens and wrong at thousands, and there's no archiving strategy — most of a million
expenses are historical and could live in a colder table.

## 4. What did you deliberately simplify or leave out given the time limit, and why?

- **Authentication and multi-team scoping.** Explicitly out of scope in the brief. The schema would
  need a `teams` table and a `team_id` on both tables, plus that column in every index and `WHERE`
  clause — a real change, not a bolt-on, which is exactly why I didn't half-do it.
- **Currency.** Everything is INR, stored as paise and formatted with a hard-coded `en-IN` locale.
  Real multi-currency means storing a currency code per expense, per-currency minor-unit precision
  (not every currency has 100 subunits), and deciding what a mixed-currency total even means — a rate
  table, with rates at time-of-spend rather than time-of-report. That's a feature, not a formatting
  detail.
- **Automated tests.** I verified the validation, the delete policy, the pagination contract, and the
  aggregate totals by hand against the running API, and drove the UI end-to-end in a browser. With
  more time the first thing I'd add is a supertest suite over the API — the validation table in the
  README is essentially a list of test cases waiting to be written.
- **Optimistic UI and polish.** Every mutation refetches the current page rather than patching local
  state. It's a couple of extra round-trips and it is always correct; optimistic updates would be
  faster and would need rollback handling I didn't want to hand-verify.
- **Soft deletes and an audit trail.** Deletes are real deletes. For shared team money you'd
  eventually want `deleted_at` and a record of who changed what — but "who" needs authentication,
  which is out of scope, so it would have been a half-feature.
- **Styling and accessibility.** The brief says styling isn't evaluated, so the CSS is about sixty
  lines. It's keyboard-usable and uses real form labels, but it hasn't had a proper accessibility
  pass (no focus-visible styling, no live regions on the error messages).
- **Server-side sort options.** The list is always newest-first. Sortable columns would mean exposing
  a sort parameter and making sure every sort has an index behind it.
