import { useState } from 'react';
import { api, money } from '../api.js';

export default function CategoryManager({ categories, onChange }) {
  const [form, setForm] = useState({ name: '', monthly_budget: '' });
  const [formError, setFormError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [rowError, setRowError] = useState(null);
  // Set when the server refuses a delete: { id, name, count }.
  const [blocked, setBlocked] = useState(null);
  const [reassignTo, setReassignTo] = useState('');

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.createCategory({
        name: form.name,
        monthly_budget: form.monthly_budget === '' ? null : form.monthly_budget,
      });
      setForm({ name: '', monthly_budget: '' });
      setFormError(null);
      await onChange();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const saveEdit = async (id) => {
    try {
      await api.updateCategory(id, {
        name: draft.name,
        monthly_budget: draft.monthly_budget === '' ? null : draft.monthly_budget,
      });
      setEditingId(null);
      setRowError(null);
      await onChange();
    } catch (err) {
      setRowError(err.message);
    }
  };

  const remove = async (category) => {
    setRowError(null);
    try {
      await api.deleteCategory(category.id);
      setBlocked(null);
      await onChange();
    } catch (err) {
      // 409 means the category still has expenses. Rather than failing, offer
      // the only safe way through: move those expenses somewhere else first.
      if (err.status === 409) {
        setBlocked({ id: category.id, name: category.name, count: err.body?.expense_count ?? 0 });
        setReassignTo('');
      } else {
        setRowError(err.message);
      }
    }
  };

  const confirmReassign = async () => {
    try {
      await api.deleteCategory(blocked.id, reassignTo);
      setBlocked(null);
      await onChange();
    } catch (err) {
      setRowError(err.message);
    }
  };

  return (
    <section>
      <form className="card" onSubmit={create}>
        <h2>Add a category</h2>
        <div className="row">
          <label className="grow">
            Name
            <input
              type="text"
              placeholder="Food &amp; Drink"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Monthly budget <span className="muted small">(optional)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="15000.00"
              value={form.monthly_budget}
              onChange={(e) => setForm({ ...form, monthly_budget: e.target.value })}
            />
          </label>
          <button type="submit">Add</button>
        </div>
        {formError && <p className="error">{formError}</p>}
      </form>

      {rowError && <p className="error">{rowError}</p>}

      {blocked && (
        <div className="card warn">
          <h2>Can’t delete “{blocked.name}” yet</h2>
          <p>
            {blocked.count} expense{blocked.count === 1 ? '' : 's'} still use this category. Deleting
            it would either destroy that spend history or leave those expenses uncategorised, so the
            server refuses. Move them to another category to continue.
          </p>
          <div className="row">
            <label className="grow">
              Move expenses to
              <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Select a category…</option>
                {categories
                  .filter((c) => c.id !== blocked.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" onClick={confirmReassign} disabled={!reassignTo}>
              Move &amp; delete
            </button>
            <button type="button" className="link" onClick={() => setBlocked(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th className="right">Monthly budget</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {categories.map((c) =>
            editingId === c.id ? (
              <tr key={c.id} className="editing">
                <td>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td className="right">
                  <input
                    className="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="none"
                    value={draft.monthly_budget}
                    onChange={(e) => setDraft({ ...draft, monthly_budget: e.target.value })}
                  />
                </td>
                <td className="right nowrap">
                  <button type="button" onClick={() => saveEdit(c.id)}>
                    Save
                  </button>{' '}
                  <button type="button" className="link" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="right">{money(c.monthly_budget)}</td>
                <td className="right nowrap">
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setEditingId(c.id);
                      setDraft({
                        name: c.name,
                        monthly_budget: c.monthly_budget === null ? '' : String(c.monthly_budget),
                      });
                    }}
                  >
                    Edit
                  </button>{' '}
                  <button type="button" className="link danger" onClick={() => remove(c)}>
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
