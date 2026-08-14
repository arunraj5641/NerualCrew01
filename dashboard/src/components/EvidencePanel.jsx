import { useState } from "react";

export default function EvidencePanel({ report }) {
  const [open, setOpen] = useState(false);
  const evidence = report.evidence || {};

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Evidence Appendix</h2>
        <button className="btn ghost" onClick={() => setOpen(!open)}>
          {open ? "Collapse all" : `Expand all (${Object.keys(evidence).length} commands)`}
        </button>
      </div>
      {!open && (
        <p className="hint">
          Raw command output captured from the target during the audit.
        </p>
      )}
      {open &&
        Object.entries(evidence).map(([cid, cc]) => (
          <details className="evidence-item" key={cid}>
            <summary>
              <span className="mono">{cid}</span>
              <span className="hint">
                {cc.error
                  ? `connector error: ${cc.error}`
                  : `exit ${cc.exit_code}`}
              </span>
            </summary>
            {cc.error ? (
              <p className="error-banner">Connector error: {cc.error}</p>
            ) : (
              <pre className="evidence-pre">
                <code>
                  {cc.stdout || "(empty)"}
                  {cc.stderr ? `\n[stderr]\n${cc.stderr}` : ""}
                </code>
              </pre>
            )}
          </details>
        ))}
    </section>
  );
}
