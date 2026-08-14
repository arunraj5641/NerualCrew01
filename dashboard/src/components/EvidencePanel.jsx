export default function EvidencePanel({ report }) {
  const evidence = report.evidence || {};
  const entries  = Object.entries(evidence);

  return (
    <div>
      <div className="section-hdr">
        <div className="section-title"><span className="si">📋</span> Evidence Appendix</div>
        <span style={{ color: "var(--text-3)", fontSize: "13px" }}>
          {entries.length} command{entries.length !== 1 ? "s" : ""} captured
        </span>
      </div>

      {entries.length === 0 && (
        <div className="card">
          <div className="card-inner">
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No evidence collected in this report.</p>
            </div>
          </div>
        </div>
      )}

      {entries.map(([cid, cc]) => (
        <details key={cid} className="ev-item">
          <summary className="ev-summary">
            <span className="ev-id">{cid}</span>
            <span className="ev-cmd">{cc.command}</span>
            {cc.error ? (
              <span className="badge b-fail">error</span>
            ) : (
              <span className={`badge ${cc.exit_code === 0 ? "b-pass" : "b-fail"}`}>
                exit {cc.exit_code}
              </span>
            )}
          </summary>
          <div className="ev-body">
            <div className="terminal">
              <div className="terminal-header">
                <div className="terminal-dots"><span /><span /><span /></div>
                <div className="terminal-title">{cc.command}</div>
              </div>
              {cc.error ? (
                <div className="terminal-body" style={{ color: "var(--red)" }}>{cc.error}</div>
              ) : (
                <div className="terminal-body" style={{ maxHeight: "260px", overflowY: "auto" }}>
                  {(cc.stdout?.length > 3000 ? cc.stdout.slice(0, 3000) + "\n…(truncated)" : cc.stdout) || "(empty output)"}
                </div>
              )}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
