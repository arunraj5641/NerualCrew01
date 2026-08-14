import { useState } from "react";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback silent fail */
    }
  };

  return (
    <button className={`btn-copy ${copied ? "copied" : ""}`} onClick={handleCopy}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

export default function FixList({ report }) {
  const fixList = report.fix_list || [];

  if (fixList.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title"><span className="title-icon">🔧</span>Prioritized Fix List</span>
        </div>
        <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎉</div>
          <p style={{ fontSize: "16px", fontWeight: 600 }}>Nothing to fix!</p>
          <p style={{ fontSize: "14px", marginTop: "6px" }}>Every checked rule passed or was UNKNOWN.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title"><span className="title-icon">🔧</span>Prioritized Fix List</span>
        <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
          {fixList.length} item{fixList.length !== 1 ? "s" : ""} to remediate
        </span>
      </div>

      <div className="fix-list">
        {fixList.map((item) => (
          <div className="fix-card" key={item.priority}>
            <div className="fix-priority-badge">{item.priority}</div>
            <div className="fix-body">
              <div className="fix-title-row">
                <span className="fix-rule-id">{item.rule_id}</span>
                {item.category && (
                  <span className="category-chip">{item.category}</span>
                )}
              </div>

              <p className="fix-finding">{item.finding}</p>

              {item.why_it_matters && (
                <p className="fix-why">
                  <strong style={{ color: "var(--text)" }}>Why it matters: </strong>
                  {item.why_it_matters}
                </p>
              )}

              {item.fix_command && (
                <div className="fix-command-wrap">
                  <pre className="fix-command-pre">{item.fix_command}</pre>
                  <CopyButton text={item.fix_command} />
                </div>
              )}

              {item.evidence_ref && (
                <p className="fix-ref">
                  Evidence ref: <span style={{ color: "var(--cyan)" }}>{item.evidence_ref}</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
