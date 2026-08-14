import { useState } from "react";

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /**/ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`btn-copy ${copied ? "copied" : ""}`} onClick={(e) => { e.stopPropagation(); copy(); }}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

export default function FixList({ report }) {
  const fixList = report.fix_list || [];

  return (
    <div>
      <div className="section-hdr">
        <div className="section-title"><span className="si">🔧</span> Prioritized Fix List</div>
        <span style={{ color: "var(--text-3)", fontSize: "13px" }}>
          {fixList.length} item{fixList.length !== 1 ? "s" : ""}
        </span>
      </div>

      {fixList.length === 0 && (
        <div className="card">
          <div className="card-inner">
            <div className="empty-state">
              <div className="empty-icon">🎉</div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--green)", marginBottom: "6px" }}>Nothing to fix!</p>
              <p>Every checked rule passed or was UNKNOWN.</p>
            </div>
          </div>
        </div>
      )}

      {fixList.map((item) => (
        <div className="fix-card" key={item.priority}>
          <div className="fix-num">{item.priority}</div>
          <div className="fix-body">
            <div className="fix-meta">
              <span className="fix-rule">{item.rule_id}</span>
              {item.category && <span className="cat-chip">{item.category}</span>}
            </div>

            <p className="fix-finding">{item.finding}</p>

            {item.why_it_matters && (
              <p className="fix-why">
                <strong style={{ color: "var(--text)" }}>Why it matters: </strong>
                {item.why_it_matters}
              </p>
            )}

            {item.fix_command && (
              <div className="terminal">
                <div className="terminal-header">
                  <div className="terminal-dots">
                    <span /><span /><span />
                  </div>
                  <div className="terminal-title">bash</div>
                  <CopyBtn text={item.fix_command} />
                </div>
                <div className="terminal-body">
                  <span className="terminal-prompt">$</span>{item.fix_command}
                </div>
              </div>
            )}

            {item.evidence_ref && (
              <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                Evidence ref: <span style={{ color: "var(--cyan)" }}>{item.evidence_ref}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
