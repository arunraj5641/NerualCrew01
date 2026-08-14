export default function EvidencePanel({ report }) {
  const evidence = report.evidence || {};
  const entries  = Object.entries(evidence);

  if (entries.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title"><span className="title-icon">📋</span>Evidence Appendix</span>
        </div>
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "32px" }}>
          No evidence collected in this report.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title"><span className="title-icon">📋</span>Evidence Appendix</span>
        <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
          {entries.length} command{entries.length !== 1 ? "s" : ""} captured
        </span>
      </div>

      {entries.map(([cid, cc]) => (
        <details key={cid} className="evidence-item">
          <summary className="evidence-summary">
            <span className="evidence-id">{cid}</span>
            <span className="evidence-cmd">{cc.command}</span>
            {cc.error ? (
              <span className="badge badge-fail" style={{ flexShrink: 0 }}>error</span>
            ) : (
              <span
                className={`badge ${cc.exit_code === 0 ? "badge-pass" : "badge-fail"}`}
                style={{ flexShrink: 0 }}
              >
                exit {cc.exit_code}
              </span>
            )}
          </summary>

          <div style={{ padding: "0 16px 14px" }}>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
                marginBottom: "8px",
              }}
            >
              $ {cc.command}
            </div>

            {cc.error ? (
              <div className="error-banner">{cc.error}</div>
            ) : (
              <pre className="evidence-pre">
                {(cc.stdout?.length > 3000
                  ? cc.stdout.slice(0, 3000) + "\n… (truncated)"
                  : cc.stdout) || "(empty output)"}
              </pre>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}
