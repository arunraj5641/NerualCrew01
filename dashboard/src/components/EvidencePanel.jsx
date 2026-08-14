import { motion } from "framer-motion";
import { FileText } from "lucide-react";

export default function EvidencePanel({ report }) {
  const evidence = report.evidence || {};
  const entries  = Object.entries(evidence);

  return (
    <div>
      <div className="section-hdr">
        <h2 className="section-title">Evidence Appendix</h2>
        <span className="section-subtitle">
          {entries.length} command{entries.length !== 1 ? "s" : ""} captured
        </span>
      </div>

      {entries.length === 0 && (
        <div className="empty-state">No evidence collected in this report.</div>
      )}

      <div className="ev-list">
        {entries.map(([cid, cc], i) => (
          <motion.details
            key={cid}
            className="ev-item"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(i * 0.03, 0.4) }}
          >
            <summary className="ev-summary">
              <FileText size={13} strokeWidth={1.5} color="var(--text-3)" style={{ flexShrink: 0 }} />
              <span className="ev-id">{cid}</span>
              <span className="ev-cmd">{cc.command}</span>
              <span className="ev-exit">
                {cc.error ? "error" : `exit ${cc.exit_code}`}
              </span>
            </summary>

            <div className="ev-body">
              <div className="terminal">
                <div className="terminal-bar">
                  <div className="terminal-dots"><span /><span /><span /></div>
                  <div className="terminal-label">{cc.command}</div>
                </div>
                {cc.error ? (
                  <div className="terminal-body" style={{ color: "var(--text-3)" }}>
                    Error: {cc.error}
                  </div>
                ) : (
                  <div className="terminal-body" style={{ maxHeight: "280px", overflowY: "auto" }}>
                    {(cc.stdout?.length > 4000
                      ? cc.stdout.slice(0, 4000) + "\n… (truncated)"
                      : cc.stdout) || "(empty output)"}
                  </div>
                )}
              </div>
            </div>
          </motion.details>
        ))}
      </div>
    </div>
  );
}
