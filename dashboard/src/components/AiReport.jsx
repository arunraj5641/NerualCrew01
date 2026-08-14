import { useRef, useState } from "react";

const STATUS_ICON  = { PASS: "✅", FAIL: "⛔", UNKNOWN: "❓" };
const STATUS_LABEL = { PASS: "Passed", FAIL: "Failed", UNKNOWN: "Unknown" };
const STATUS_ORDER = ["FAIL", "UNKNOWN", "PASS"];
const MODEL        = "nvidia/nemotron-3-super-120b-a12b";

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /**/ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`btn-copy ${copied ? "copied" : ""}`} onClick={copy}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

function riskColor(s) {
  if (s >= 75) return "#f87171";
  if (s >= 50) return "#fb923c";
  if (s >= 25) return "#fbbf24";
  return "#34d399";
}

function exportMD(result, report) {
  const lines = [];
  lines.push("# AI Security Remediation Report\n");
  lines.push(`**Target:** ${report.target || "—"}  \n**Transport:** ${report.transport || "—"}  \n**Model:** ${result.model || MODEL}  \n**Risk Score:** ${result.risk_score ?? "—"}/100\n`);
  lines.push(`## Executive Summary\n\n${result.executive_summary}\n`);
  const grouped = {};
  (result.items || []).forEach((it) => { (grouped[it.status] = grouped[it.status] || []).push(it); });
  STATUS_ORDER.forEach((st) => {
    const g = grouped[st] || [];
    if (!g.length) return;
    lines.push(`## ${STATUS_ICON[st]} ${STATUS_LABEL[st]} (${g.length})\n`);
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
  const [loading,   setLoading]   = useState(false);
  const [thinking,  setThinking]  = useState("");
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const thinkRef = useRef(null);

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
      {/* Hero CTA (shown before generation) */}
      {!result && !loading && (
        <div className="ai-hero" style={{ marginBottom: "20px" }}>
          <span className="ai-hero-icon">🤖</span>
          <h2 className="ai-hero-title">AI Remediation Report</h2>
          <p className="ai-hero-sub">
            Nemotron-3-Super-120B will analyse every finding — PASS, FAIL and UNKNOWN —
            and return plain-English guidance, risk ratings, and exact fix commands.
          </p>
          <div className="ai-model-tag">✦ {MODEL}</div>
          <br />
          {error && <div className="error-banner" style={{ maxWidth: "500px", margin: "0 auto 16px" }}>⚠️ {error}</div>}
          <button className="btn btn-primary" onClick={run} disabled={loading} id="gen-ai-btn">
            🚀 Generate AI Report
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="card-inner">
            <div className="ai-loading-wrap">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <span style={{ fontSize: "20px", animation: "aiFloat 1.5s ease-in-out infinite" }}>🤖</span>
                <span style={{ color: "var(--text-2)", fontSize: "14px" }}>Nemotron is analysing your audit report…</span>
              </div>
              <div className="ai-progress">
                <div className="ai-progress-bar" style={{ width: "100%" }} />
              </div>
              {thinking && (
                <div className="ai-thinking-panel">
                  <div className="ai-thinking-hdr">
                    <div className="think-pulse" />
                    Reasoning in progress
                  </div>
                  <div className="ai-thinking-text" ref={thinkRef}>{thinking}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error (after attempt) */}
      {error && result === null && !loading && (
        <div className="error-banner">⚠️ {error}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={run}>Retry</button>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Executive summary */}
          {result.executive_summary && (
            <div className="exec-card">
              <div className="exec-label">⚡ Executive Summary</div>
              <p className="exec-text">{result.executive_summary}</p>
              {result.risk_score != null && (
                <div className="risk-row">
                  <span className="risk-lbl">Risk Score</span>
                  <div className="risk-bar-wrap">
                    <div className="risk-bar-fill" style={{ width: `${result.risk_score}%`, background: riskColor(result.risk_score) }} />
                  </div>
                  <span className="risk-score" style={{ color: riskColor(result.risk_score) }}>{result.risk_score}</span>
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
                  {STATUS_ICON[st]} {STATUS_LABEL[st]} ({group.length})
                </div>
                {group.map((item) => (
                  <div key={item.rule_id} className={`ai-item ai-${item.status}`}>
                    <div className="ai-item-hdr">
                      <span style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--cyan)" }}>{item.rule_id}</span>
                      <span className={`badge b-${item.status?.toLowerCase()}`}>
                        {STATUS_ICON[item.status]} {STATUS_LABEL[item.status] || item.status}
                      </span>
                      {item.severity_hint && (
                        <span className={`sev-badge sev-${item.severity_hint}`}>{item.severity_hint}</span>
                      )}
                    </div>
                    <p className="ai-item-finding">{item.finding}</p>
                    {item.why_it_matters && (
                      <p className="ai-item-why">
                        <strong style={{ color: "var(--text)" }}>
                          {item.status === "PASS" ? "Why it's good: " : "Why it matters: "}
                        </strong>
                        {item.why_it_matters}
                      </p>
                    )}
                    {item.risk_assessment && (
                      <p className="ai-item-risk">⚠️ <strong>Risk:</strong> {item.risk_assessment}</p>
                    )}
                    {item.fix_command && (
                      <div className="terminal">
                        <div className="terminal-header">
                          <div className="terminal-dots"><span /><span /><span /></div>
                          <div className="terminal-title">remediation</div>
                          <CopyBtn text={item.fix_command} />
                        </div>
                        <div className="terminal-body">
                          <span className="terminal-prompt">$</span>{item.fix_command}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Footer actions */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-ghost btn-sm" onClick={run} disabled={loading}>↺ Regenerate</button>
            <button className="btn btn-ghost btn-sm" onClick={() => exportMD(result, report)}>⬇ Export .md</button>
          </div>
        </>
      )}
    </div>
  );
}
