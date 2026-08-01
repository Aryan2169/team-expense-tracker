export default function ExpenseFilters({ categories, filters, onChange, onReset }) {
  const set = (field) => (e) => onChange({ ...filters, [field]: e.target.value });
  const active = filters.category_id || filters.from || filters.to;

  return (
    <div className="card">
      <h2>Filter</h2>
      <div className="row">
        <label>
          Category
          <select value={filters.category_id} onChange={set('category_id')}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          From
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>

        <label>
          To
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>

        <button type="button" onClick={onReset} disabled={!active}>
          Clear
        </button>
      </div>
      <p className="muted small">
        Filtering happens in SQL — the server only ever returns one page of matching rows.
      </p>
    </div>
  );
}
