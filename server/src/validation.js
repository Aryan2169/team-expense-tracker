import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `new Date('2025-02-30')` does not throw - it rolls over to March 2nd. So a
 * regex alone is not enough: round-trip the parsed date and require it to come
 * back identical.
 */
export function isRealDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

const dateString = z
  .string()
  .refine(isRealDate, 'must be a real calendar date in YYYY-MM-DD format');

// Cap at $10,000,000 - large enough for any real expense, small enough that a
// fat-fingered or hostile value can't overflow the SUM() in the summary.
const MAX_CENTS = 1_000_000_000;

/**
 * Accepts 12, "12", "12.5", "12.50". Rejects 0, negatives, NaN, Infinity, and
 * anything with more than two decimal places (silently rounding a user's
 * 10.999 to 11.00 is worse than telling them).
 *
 * Math.round on the scaled value, not parseFloat truncation: (19.99 * 100) is
 * 1998.9999999999998 in IEEE-754, and | 0 would charge the team a cent less.
 */
export const amountToCents = z
  .union([z.number(), z.string().trim().min(1)], {
    errorMap: () => ({ message: 'is required and must be a number' }),
  })
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v);
    const fail = (message) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    };
    if (!Number.isFinite(n)) return fail('must be a number');
    if (n <= 0) return fail('must be greater than 0');
    if (Math.round(n * 100) !== Number((n * 100).toFixed(4))) {
      return fail('must have at most 2 decimal places');
    }
    const cents = Math.round(n * 100);
    if (cents > MAX_CENTS) return fail('is unrealistically large');
    return cents;
  });

const budgetToCents = z
  .union([z.number(), z.string().trim()])
  .transform((v, ctx) => {
    if (v === '' || v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    const fail = (message) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    };
    if (!Number.isFinite(n)) return fail('must be a number');
    if (n < 0) return fail('cannot be negative');
    if (Math.round(n * 100) !== Number((n * 100).toFixed(4))) {
      return fail('must have at most 2 decimal places');
    }
    const cents = Math.round(n * 100);
    if (cents > MAX_CENTS) return fail('is unrealistically large');
    return cents;
  })
  .nullable();

const id = z.coerce
  .number({ invalid_type_error: 'is required and must be a category id' })
  .int('must be a whole number')
  .positive('must be a positive id');

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'is required').max(60, 'must be 60 characters or fewer'),
  monthly_budget: budgetToCents.optional().default(null),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'cannot be empty').max(60).optional(),
    monthly_budget: budgetToCents.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const createExpenseSchema = z.object({
  amount: amountToCents,
  description: z
    .string({ required_error: 'is required' })
    .trim()
    .min(1, 'is required')
    .max(200, 'must be 200 characters or fewer'),
  category_id: id,
  date: dateString,
});

export const updateExpenseSchema = z
  .object({
    amount: amountToCents.optional(),
    description: z.string().trim().min(1, 'cannot be empty').max(200).optional(),
    category_id: id.optional(),
    date: dateString.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const listExpensesQuerySchema = z
  .object({
    category_id: id.optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    // Clamped, not rejected: a client asking for 10,000 rows gets 100, which is
    // the whole point of having a limit. Garbage falls back to the default.
    limit: z.coerce
      .number()
      .int()
      .catch(DEFAULT_LIMIT)
      .transform((n) => Math.min(Math.max(n, 1), MAX_LIMIT)),
    offset: z.coerce
      .number()
      .int()
      .catch(0)
      .transform((n) => Math.max(n, 0)),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const summaryQuerySchema = z
  .object({
    month: z.string().regex(MONTH, 'must be in YYYY-MM format').optional(),
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

/** First and last day of a YYYY-MM month, as ISO date strings. */
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Current month as YYYY-MM, in local time. */
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
