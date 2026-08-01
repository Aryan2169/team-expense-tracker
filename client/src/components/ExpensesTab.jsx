import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import ExpenseFilters from './ExpenseFilters.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import ExpenseTable from './ExpenseTable.jsx';
import Pagination from './Pagination.jsx';

const PAGE_SIZE = 10;
const EMPTY_FILTERS = { category_id: '', from: '', to: '' };

export default function ExpensesTab({ categories }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listExpenses({ ...filters, limit: PAGE_SIZE, offset });
      setRows(res.data);
      setTotal(res.page.total);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // Changing a filter has to reset paging: page 4 of the old result set is
  // meaningless against the new one, and often past the end of it.
  const applyFilters = (next) => {
    setFilters(next);
    setOffset(0);
  };

  const afterMutation = async () => {
    // A delete can empty the last page; step back so the user isn't left
    // staring at a blank table.
    if (rows.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE));
    else await load();
  };

  return (
    <section>
      <ExpenseForm categories={categories} onCreated={load} />

      <ExpenseFilters
        categories={categories}
        filters={filters}
        onChange={applyFilters}
        onReset={() => applyFilters(EMPTY_FILTERS)}
      />

      {error && <p className="error">{error}</p>}

      <ExpenseTable
        rows={rows}
        categories={categories}
        loading={loading}
        onSave={async (id, patch) => {
          await api.updateExpense(id, patch);
          await load();
        }}
        onDelete={async (id) => {
          await api.deleteExpense(id);
          await afterMutation();
        }}
      />

      <Pagination
        offset={offset}
        limit={PAGE_SIZE}
        total={total}
        onChange={setOffset}
      />
    </section>
  );
}
