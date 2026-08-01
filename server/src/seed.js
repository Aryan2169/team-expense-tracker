/**
 * Seeds enough data that pagination and the over-budget flag are visible the
 * moment you open the app: 6 categories and ~120 expenses across the current
 * month and the two before it.
 *
 * Deterministic - a fixed PRNG seed means everyone who runs this gets the same
 * database, so "the summary says $X" is reproducible when comparing notes.
 *
 *   npm run seed            # only seeds if the tables are empty
 *   npm run reset           # wipes both tables first
 */
import { db } from './db.js';

const reset = process.argv.includes('--reset');

// mulberry32 - small, fast, deterministic.
function rng(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20240517);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const CATEGORIES = [
  // Budgets chosen so a couple of categories run over in a typical month -
  // otherwise the flag the brief asks for never shows up in a demo.
  { name: 'Food & Drink', monthly_budget_cents: 40000 },
  { name: 'Software', monthly_budget_cents: 15000 },
  { name: 'Travel', monthly_budget_cents: 60000 },
  { name: 'Office Supplies', monthly_budget_cents: 30000 },
  { name: 'Team Events', monthly_budget_cents: null },
  { name: 'Miscellaneous', monthly_budget_cents: null },
];

const DESCRIPTIONS = {
  'Food & Drink': ['Team lunch', 'Coffee run', 'Client dinner', 'Snacks restock', 'Friday pizza'],
  Software: ['Figma seats', 'GitHub Team', 'Linear subscription', 'Sentry plan', 'Domain renewal'],
  Travel: ['Train to client site', 'Airport taxi', 'Hotel - 1 night', 'Conference ticket', 'Mileage claim'],
  'Office Supplies': ['Whiteboard markers', 'USB-C hub', 'Desk lamp', 'Notebooks', 'Printer paper'],
  'Team Events': ['Quarterly offsite', 'Bowling night', 'Birthday cake', 'Board game night'],
  Miscellaneous: ['Courier', 'Parking', 'Bank fee', 'Replacement charger'],
};

// Rough per-expense range per category, in cents.
const AMOUNTS = {
  'Food & Drink': [800, 9500],
  Software: [1200, 8900],
  Travel: [2500, 24000],
  'Office Supplies': [600, 7500],
  'Team Events': [4000, 30000],
  Miscellaneous: [300, 4500],
};

// How many expenses to create per month, per category. 40 a month over three
// months is 120 rows: enough to page through at 10 per page, and enough that
// some budgeted categories reliably end the month over while others stay
// inside - so the summary demonstrates both states.
const PER_MONTH = {
  'Food & Drink': 14,
  Software: 5,
  Travel: 3,
  'Office Supplies': 6,
  'Team Events': 4,
  Miscellaneous: 8,
};

const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function monthsBack(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const isCurrent = i === 0;
    out.push({
      year,
      month,
      // Never date an expense in the future: the current month stops at today.
      maxDay: isCurrent ? now.getDate() : lastDay,
    });
  }
  return out;
}

const seedAll = db.transaction(() => {
  if (reset) {
    db.exec('DELETE FROM expenses; DELETE FROM categories; DELETE FROM sqlite_sequence;');
  }

  const existing = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (existing > 0) {
    console.log('Database already has data - nothing to do. Use `npm run reset` to reseed.');
    return;
  }

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, monthly_budget_cents) VALUES (?, ?)',
  );
  const ids = {};
  for (const c of CATEGORIES) {
    ids[c.name] = insertCategory.run(c.name, c.monthly_budget_cents).lastInsertRowid;
  }

  const insertExpense = db.prepare(
    'INSERT INTO expenses (amount_cents, description, category_id, spent_on) VALUES (?, ?, ?, ?)',
  );

  let count = 0;
  for (const { year, month, maxDay } of monthsBack(3)) {
    for (const c of CATEGORIES) {
      for (let i = 0; i < PER_MONTH[c.name]; i += 1) {
        const [lo, hi] = AMOUNTS[c.name];
        insertExpense.run(
          between(lo, hi),
          pick(DESCRIPTIONS[c.name]),
          ids[c.name],
          iso(year, month, between(1, maxDay)),
        );
        count += 1;
      }
    }
  }

  console.log(`Seeded ${CATEGORIES.length} categories and ${count} expenses.`);
});

seedAll();
