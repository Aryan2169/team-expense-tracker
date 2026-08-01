import { useState } from 'react';
import { api, todayISO } from '../api.js';

const blank = () => ({ amount: '', description: '', category_id: '', date: todayISO() });

export default function ExpenseForm({ categories, onCreated }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Deliberately no client-side validation beyond `required`: the server is
      // the authority, and its error messages are what get shown here. That
      // keeps one set of rules instead of two that drift apart.
      await api.createExpense({
        amount: form.amount,
        description: form.description,
        category_id: form.category_id === '' ? undefined : Number(form.category_id),
        date: form.date,
      });
      setForm(blank());
      setError(null);
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add an expense</h2>

      <div className="row">
        <label>
          Amount
          <input
            type="text"
            inputMode="decimal"
            placeholder="24.50"
            value={form.amount}
            onChange={set('amount')}
          />
        </label>

        <label className="grow">
          Description
          <input
            type="text"
            placeholder="Team lunch"
            value={form.description}
            onChange={set('description')}
          />
        </label>

        <label>
          Category
          <select value={form.category_id} onChange={set('category_id')}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Date
          <input type="date" value={form.date} onChange={set('date')} />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
