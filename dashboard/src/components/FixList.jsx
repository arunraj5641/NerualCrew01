export default function FixList({ report }) {
  const fixList = report.fix_list || [];

  if (fixList.length === 0) {
    return (
      <section className="panel">
        <h2>Prioritized Fix List</h2>
        <p className="nothing-to-fix">🎉 Nothing to fix — every checked rule passed or was UNKNOWN.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Prioritized Fix List</h2>
      <div className="fix-list">
        {fixList.map((item) => (
          <div className="fix-card" key={item.priority}>
            <div className="fix-priority">{item.priority}</div>
            <div className="fix-body">
              <div className="fix-title">
                <span className="mono">{item.rule_id}</span>
                <span className="chip category-chip">{item.category}</span>
              </div>
              <p className="fix-finding">{item.finding}</p>
              <p className="fix-why">
                <strong>Why it matters:</strong> {item.why_it_matters}
              </p>
              <pre className="fix-command">
                <code>{item.fix_command}</code>
              </pre>
              <p className="fix-ref">
                Evidence ref: <span className="mono">{item.evidence_ref}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
