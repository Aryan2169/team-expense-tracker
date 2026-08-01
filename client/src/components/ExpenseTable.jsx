import { useState } from 'react';
import { money } from '../api.js';

export default function ExpenseTable({ rows, categories, loading, onSave, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const startEdit = (row) => {
    setEditingId(row.id);
    setError(null);
    setDraft({
      amount: String(row.amount),
      description: row.description,
      category_id: String(row.category_id),
      date: row.date,
    });
  };

  const cancel = () => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  };

  const save = async (id) => {
    setBusy(true);
    try {
      await onSave(id, {
        amount: draft.amount,
        description: draft.description,
        category_id: Number(draft.category_id),
        date: draft.date,
      });
      cancel();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.description}"?`)) return;
    setBusy(true);
    try {
      await onDelete(row.id);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });

  if (loading && rows.length === 0) return <p className="muted">Loading…</p>;
  if (rows.length === 0) return <p className="muted">No expenses match these filters.</p>;

  return (
    <>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th className="right">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            editingId === row.id ? (
              <tr key={row.id} className="editing">
                <td>
                  <input type="date" value={draft.date} onChange={set('date')} />
                </td>
                <td>
                  <input type="text" value={draft.description} onChange={set('description')} />
                </td>
                <td>
                  <select value={draft.category_id} onChange={set('category_id')}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="right">
                  <input
                    className="amount"
                    type="text"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={set('amount')}
                  />
                </td>
                <td className="right nowrap">
                  <button type="button" onClick={() => save(row.id)} disabled={busy}>
                    Save
                  </button>{' '}
                  <button type="button" className="link" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={row.id}>
                <td className="nowrap">{row.date}</td>
                <td>{row.description}</td>
                <td>{row.category_name}</td>
                <td className="right">{money(row.amount)}</td>
                <td className="right nowrap">
                  <button type="button" className="link" onClick={() => startEdit(row)}>
                    Edit
                  </button>{' '}
                  <button
                    type="button"
                    className="link danger"
                    onClick={() => remove(row)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </>
  );
}
