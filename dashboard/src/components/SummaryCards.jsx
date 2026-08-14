const STATUS_LABELS = { PASS: "Pass", FAIL: "Fail", UNKNOWN: "Unknown" };

export default function SummaryCards({ report }) {
  const s = report.summary;
  const total = (s.PASS || 0) + (s.FAIL || 0) + (s.UNKNOWN || 0);
  const sev = report.severity_counts_failed || {};

  const cards = [
    { label: "PASS", value: s.PASS || 0, cls: "card-pass", icon: "✅" },
    { label: "FAIL", value: s.FAIL || 0, cls: "card-fail", icon: "⛔" },
    { label: "UNKNOWN", value: s.UNKNOWN || 0, cls: "card-unknown", icon: "❓" },
  ];

  return (
    <section className="panel">
      <h2>Summary</h2>
      <div className="summary-grid">
        {cards.map((c) => (
          <div key={c.label} className={`summary-card ${c.cls}`}>
            <div className="summary-icon">{c.icon}</div>
            <div className="summary-value">{c.value}</div>
            <div className="summary-label">{c.label}</div>
          </div>
        ))}
        <div className="summary-card card-total">
          <div className="summary-icon">📊</div>
          <div className="summary-value">{total}</div>
          <div className="summary-label">Rules checked</div>
        </div>
      </div>
      <div className="severity-bar">
        <span>Failed by severity:</span>
        {["critical", "high", "medium", "low"].map((sevName) => (
          <span
            key={sevName}
            className={`chip sev-chip ${sevName}`}
            title={`${sevName} failures`}
          >
            {sev[sevName] || 0} {sevName}
          </span>
        ))}
      </div>
    </section>
  );
}

export { STATUS_LABELS };
