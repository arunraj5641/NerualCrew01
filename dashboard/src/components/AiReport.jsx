import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Copy, Check, Download, RefreshCw } from "lucide-react";

const STATUS_ORDER = ["FAIL", "UNKNOWN", "PASS"];
const STATUS_LABEL = { PASS: "Passed", FAIL: "Failed", UNKNOWN: "Unknown" };
const MODEL        = "nvidia/nemotron-3-super-120b-a12b";

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /**/ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`btn-icon ${copied ? "copied" : ""}`} onClick={copy} aria-label="Copy">
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function exportMD(result, report) {
  const lines = [];
  lines.push("# AI Security Remediation Report\n");
  lines.push(`**Target:** ${report.target || "—"}  \n**Model:** ${result.model || MODEL}  \n**Risk Score:** ${result.risk_score ?? "—"}/100\n`);
  lines.push(`## Executive Summary\n\n${result.executive_summary}\n`);
  const grouped = {};
  (result.items || []).forEach((it) => { (grouped[it.status] = grouped[it.status] || []).push(it); });
  STATUS_ORDER.forEach((st) => {
    const g = grouped[st] || [];
    if (!g.length) return;
    lines.push(`## ${STATUS_LABEL[st]} (${g.length})\n`);
    g.forEach((it) => {
      lines.push(`### ${it.rule_id}\n\n${it.finding}\n`);
      if (it.why_it_matters) lines.push(`**Why:** ${it.why_it_matters}\n`);
      if (it.fix_command) lines.push(`**Fix:**\n\`\`\`bash\n${it.fix_command}\n\`\`\`\n`);
    });
  });
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cis-ai-report-${Date.now()}.md`;
  a.click();
}

export default function AiReport({ report }) {
  const [loading,  setLoading]  = useState(false);
  const [thinking, setThinking] = useState("");
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");
  const thinkRef = useRef(null);

  // ── All API/streaming logic unchanged ──────────────────────────────────────
  const run = async () => {
    setLoading(true); setError(""); setResult(null); setThinking("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: report.target, transport: report.transport,
          summary: report.summary, findings: report.findings, fix_list: report.fix_list,
        }),
      });
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const lines = part.trim().split("\n");
          let ev = "message", dataStr = "";
          for (const l of lines) {
            if (l.startsWith("event:")) ev = l.slice(6).trim();
            if (l.startsWith("data:"))  dataStr = l.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr);
            if (ev === "thinking") {
              setThinking((p) => { const n = p + payload.text; setTimeout(() => { if (thinkRef.current) thinkRef.current.scrollTop = 9999; }, 0); return n; });
            } else if (ev === "done") {
              setResult(payload); setLoading(false);
            } else if (ev === "error") {
              throw new Error(payload.error);
            }
          } catch (pe) { if (pe.message?.startsWith("LLM")) throw pe; }
        }
      }
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const grouped = {};
  (result?.items || []).forEach((it) => { (grouped[it.status] = grouped[it.status] || []).push(it); });

  return (
    <div>
      {/* CTA hero */}
      {!result && !loading && (
        <div className="ai-hero">
          <div className="ai-hero-icon">
            <Bot size={22} strokeWidth={1.5} />
          </div>
          <h2 className="ai-hero-title">AI Remediation Report</h2>
          <p className="ai-hero-sub">
            Analyse every finding with Nemotron‑3‑Super‑120B and receive
            plain-English guidance, risk ratings, and exact fix commands
            for all PASS, FAIL, and UNKNOWN controls.
          </p>
          <div className="ai-model-tag">
            <Bot size={11} strokeWidth={2} />
            {MODEL}
          </div>
          <br />
          {error && (
            <div className="error-msg" style={{ maxWidth: "480px", margin: "0 auto 20px" }}>
              {error}
            </div>
          )}
          <button className="btn-scan" onClick={run} disabled={loading} id="gen-ai-btn">
            Generate AI Report
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="ai-progress"><div className="ai-progress-fill" /></div>

          <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "14px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
            Analysing {(report.findings || []).length} findings…
          </div>

          {thinking && (
            <div className="ai-thinking-panel">
              <div className="ai-thinking-label">
                <div className="ai-thinking-dot" />
                Reasoning
              </div>
              <div className="ai-thinking-text" ref={thinkRef}>{thinking}</div>
            </div>
          )}
        </motion.div>
      )}

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* Executive summary */}
          {result.executive_summary && (
            <div className="exec-card">
              <div className="exec-label">Executive Summary</div>
              <p className="exec-text">{result.executive_summary}</p>
              {result.risk_score != null && (
                <div className="risk-row">
                  <span className="risk-lbl">Risk Score</span>
                  <div className="risk-bar-wrap">
                    <div className="risk-bar-fill" style={{ width: `${result.risk_score}%` }} />
                  </div>
                  <span className="risk-score">{result.risk_score}</span>
                  <span className="risk-max">/100</span>
                </div>
              )}
            </div>
          )}

          {/* Per-status groups */}
          {STATUS_ORDER.map((st) => {
            const group = grouped[st] || [];
            if (!group.length) return null;
            return (
              <div key={st}>
                <div className="ai-group-hdr">
                  {STATUS_LABEL[st]} ({group.length})
                </div>
                {group.map((item, i) => (
                  <motion.div
                    key={item.rule_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: i * 0.04 }}
                    className={`ai-item ${item.status === "FAIL" ? "ai-item-fail" : ""} ${item.status === "UNKNOWN" ? "ai-item-unknown" : ""}`}
                  >
                    <div className="ai-item-hdr">
                      <span className="ai-rule-id">{item.rule_id}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "2px 9px", borderRadius: "99px", fontFamily: "var(--mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      {item.severity_hint && (
                        <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "var(--mono)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {item.severity_hint}
                        </span>
                      )}
                    </div>

                    <p className="ai-item-finding">{item.finding}</p>

                    {item.why_it_matters && (
                      <p className="ai-item-why">
                        <strong style={{ color: "var(--text-2)" }}>Why it matters: </strong>
                        {item.why_it_matters}
                      </p>
                    )}

                    {item.risk_assessment && (
                      <p className="ai-item-risk">{item.risk_assessment}</p>
                    )}

                    {item.fix_command && (
                      <div className="terminal" style={{ marginTop: "12px" }}>
                        <div className="terminal-bar">
                          <div className="terminal-dots"><span /><span /><span /></div>
                          <div className="terminal-label">remediation</div>
                          <CopyBtn text={item.fix_command} />
                        </div>
                        <div className="terminal-body">
                          <span className="terminal-prompt">$</span>
                          {item.fix_command}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            );
          })}

          {/* Footer */}
          <div className="ai-footer">
            <button className="btn-ghost" onClick={run} disabled={loading}>
              <RefreshCw size={13} />
              Regenerate
            </button>
            <button className="btn-ghost" onClick={() => exportMD(result, report)}>
              <Download size={13} />
              Export .md
            </button>
          </div>
        </motion.div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  );
}
