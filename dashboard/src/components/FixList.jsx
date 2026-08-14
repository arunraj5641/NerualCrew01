import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Terminal } from "lucide-react";

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); } catch { /**/ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      className={`btn-icon ${copied ? "copied" : ""}`}
      onClick={copy}
      aria-label="Copy command"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function FixList({ report }) {
  const fixList = report.fix_list || [];

  return (
    <div>
      <div className="section-hdr">
        <div>
          <h2 className="section-title">Priority Queue</h2>
          <p style={{ color: "var(--text-3)", fontSize: "14px", marginTop: "4px" }}>
            Ordered remediation steps for failed controls
          </p>
        </div>
        <span className="section-subtitle">{fixList.length} items</span>
      </div>

      {fixList.length === 0 && (
        <div className="card" style={{ padding: "64px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>✓</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
            No issues to fix
          </div>
          <div style={{ color: "var(--text-3)", fontSize: "14px" }}>
            Every checked rule passed or could not be verified.
          </div>
        </div>
      )}

      <div className="pq-list">
        {fixList.map((item, i) => (
          <motion.div
            key={item.priority}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: i * 0.05 }}
          >
            <div className="pq-card">
              <div className="pq-header">
                <span className="pq-num">
                  {String(item.priority).padStart(2, "0")}
                </span>
                {item.category && (
                  <span className="pq-sev">{item.category}</span>
                )}
              </div>

              <div className="pq-rule-id">{item.rule_id}</div>
              <h3 className="pq-title">
                {item.finding?.split(":")[0] || item.rule_id}
              </h3>

              {item.finding && (
                <p className="pq-finding">{item.finding}</p>
              )}

              {item.why_it_matters && (
                <p className="pq-why">{item.why_it_matters}</p>
              )}

              {item.fix_command && (
                <div className="terminal">
                  <div className="terminal-bar">
                    <div className="terminal-dots">
                      <span /><span /><span />
                    </div>
                    <div className="terminal-label">
                      <Terminal size={10} strokeWidth={2} style={{ display: "inline", marginRight: "5px" }} />
                      bash
                    </div>
                    <CopyBtn text={item.fix_command} />
                  </div>
                  <div className="terminal-body">
                    <span className="terminal-prompt">$</span>
                    {item.fix_command}
                  </div>
                </div>
              )}

              {item.evidence_ref && (
                <div style={{ marginTop: "14px", fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  Evidence: {item.evidence_ref}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
