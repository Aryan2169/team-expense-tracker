import { useCallback, useEffect, useState } from 'react';
import { api, currentMonth, money } from '../api.js';

export default function SummaryView() {
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setSummary(await api.summary({ month }));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section>
      <div className="card">
        <h2>Spending summary</h2>
        <div className="row">
          <label>
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          {summary && (
            <p className="total">
              Total spend: <strong>{money(summary.total_spend)}</strong>
            </p>
          )}
        </div>
        <p className="muted small">
          Budgets are monthly, so the summary is scoped to one month. Totals and the over-budget flag
          are computed by a single GROUP BY query in SQLite — no rows are summed in the browser or
          the Node process.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {summary && (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th className="right">Expenses</th>
              <th className="right">Total</th>
              <th className="right">Budget</th>
              <th className="right">Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.data.map((r) => (
              <tr key={r.category_id} className={r.over_budget ? 'over' : undefined}>
                <td>{r.name}</td>
                <td className="right">{r.expense_count}</td>
                <td className="right">{money(r.total)}</td>
                <td className="right">{money(r.monthly_budget)}</td>
                <td className="right">{money(r.remaining)}</td>
                <td>
                  {r.over_budget ? (
                    <span className="badge danger">OVER BUDGET</span>
                  ) : r.monthly_budget === null ? (
                    <span className="muted small">no budget set</span>
                  ) : (
                    <span className="badge ok">within budget</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
