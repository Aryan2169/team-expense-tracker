import { useCallback, useEffect, useState } from 'react';
import CategoryManager from './components/CategoryManager.jsx';
import ExpensesTab from './components/ExpensesTab.jsx';
import SummaryView from './components/SummaryView.jsx';
import { api } from './api.js';

const TABS = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'categories', label: 'Categories' },
  { id: 'summary', label: 'Summary' },
];

export default function App() {
  const [tab, setTab] = useState('expenses');
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState(null);

  // Categories are needed by all three tabs, so they live here and are passed
  // down. Anything that mutates them calls refreshCategories().
  const refreshCategories = useCallback(async () => {
    try {
      const res = await api.listCategories();
      setCategories(res.data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  return (
    <main>
      <header>
        <h1>Team Expense Tracker</h1>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loadError && (
        <p className="error">
          Could not reach the API: {loadError}. Is the server running on port 3001?
        </p>
      )}

      {tab === 'expenses' && <ExpensesTab categories={categories} />}
      {tab === 'categories' && (
        <CategoryManager categories={categories} onChange={refreshCategories} />
      )}
      {tab === 'summary' && <SummaryView />}
    </main>
  );
}
