/**
 * Thin fetch wrapper. Its one job beyond JSON parsing: turn the server's
 * `{ error: { message, ... } }` shape into a thrown Error the UI can render,
 * so no component ever has to check `res.ok` itself.
 */
export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = body?.error ?? {};
    // Field-level validation details are more useful than the generic message.
    const detail = err.details?.map((d) => `${d.field} ${d.message}`).join('; ');
    throw new ApiError(res.status, detail || err.message || `Request failed (${res.status})`, err);
  }

  return body;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, v);
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const api = {
  listCategories: () => request('/categories'),
  createCategory: (body) => request('/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id, body) =>
    request(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCategory: (id, reassignTo) =>
    request(`/categories/${id}${reassignTo ? `?reassign_to=${reassignTo}` : ''}`, {
      method: 'DELETE',
    }),

  listExpenses: (params) => request(`/expenses${qs(params)}`),
  createExpense: (body) => request('/expenses', { method: 'POST', body: JSON.stringify(body) }),
  updateExpense: (id, body) =>
    request(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),

  summary: (params) => request(`/summary${qs(params)}`),
};

// Pinned to en-US rather than the browser locale: with an unrelated locale the
// same call renders "US$27.83". Single-currency app, so a fixed format is the
// honest choice - see NOTES.md on multi-currency being out of scope.
export const money = (n) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const currentMonth = () => todayISO().slice(0, 7);
