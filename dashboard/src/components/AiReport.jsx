import { useRef, useState } from "react";

const STATUS_ICON  = { PASS: "✅", FAIL: "⛔", UNKNOWN: "❓" };
const STATUS_LABEL = { PASS: "Passed", FAIL: "Failed", UNKNOWN: "Unknown" };
const STATUS_ORDER = ["FAIL", "UNKNOWN", "PASS"];

const MODEL_NAME = "nvidia/nemotron-3-super-120b-a12b";

// ── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text, small }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /**/ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`btn-copy${small ? " btn-sm" : ""} ${copied ? "copied" : ""}`} onClick={copy}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

// ── Risk colour helper ───────────────────────────────────────────────────────
function riskColor(score) {
  if (score >= 75) return "#f87171";
  if (score >= 50) return "#fb923c";
  if (score >= 25) return "#fbbf24";
  return "#22c55e";
}

// ── Single AI finding card ───────────────────────────────────────────────────
function AiItemCard({ item }) {
  return (
    <div className={`ai-item-card status-${item.status}`}>
      <div className="ai-item-header">
        <span className="rule-id">{item.rule_id}</span>
        <span className={`badge badge-${item.status?.toLowerCase()}`}>
          {STATUS_ICON[item.status]} {STATUS_LABEL[item.status] || item.status}
        </span>
        {item.severity_hint && (
          <span className={`sev-chip ${item.severity_hint}`}>{item.severity_hint}</span>
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
        <p className="ai-item-risk">
          ⚠️ <strong>Risk:</strong> {item.risk_assessment}
        </p>
      )}

      {item.fix_command && (
        <div className="ai-cmd-wrap">
          <pre className="ai-cmd-pre">{item.fix_command}</pre>
          <CopyButton text={item.fix_command} small />
        </div>
      )}
    </div>
  );
}

// ── Export to markdown ───────────────────────────────────────────────────────
function exportMarkdown(result, report) {
  const lines = [];
  lines.push(`# AI Security Remediation Report`);
  lines.push(`\n**Target:** ${report.target || "—"}  `);
  lines.push(`**Transport:** ${report.transport || "—"}  `);
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push(`**Model:** ${result.model || MODEL_NAME}  `);
  lines.push(`**Risk Score:** ${result.risk_score ?? "—"}/100\n`);
  lines.push(`## Executive Summary\n\n${result.executive_summary}\n`);

  const grouped = {};
  (result.items || []).forEach((it) => {
    (grouped[it.status] = grouped[it.status] || []).push(it);
  });

  STATUS_ORDER.forEach((st) => {
    const group = grouped[st] || [];
    if (!group.length) return;
    lines.push(`## ${STATUS_ICON[st]} ${STATUS_LABEL[st]} (${group.length})\n`);
    group.forEach((it) => {
      lines.push(`### ${it.rule_id} — ${it.severity_hint || ""}`);
      lines.push(`\n${it.finding}\n`);
      if (it.why_it_matters) lines.push(`**Why:** ${it.why_it_matters}\n`);
      if (it.risk_assessment) lines.push(`**Risk:** ${it.risk_assessment}\n`);
      if (it.fix_command) {
        lines.push("**Fix:**\n```bash");
        lines.push(it.fix_command);
        lines.push("```\n");
      }
    });
  });

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cis-ai-report-${Date.now()}.md`;
  a.click();
}

// ── Main AiReport component ──────────────────────────────────────────────────
export default function AiReport({ report }) {
  const [loading, setLoading]       = useState(false);
  const [thinking, setThinking]     = useState("");
  const [streaming, setStreaming]   = useState("");
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState("");
  const thinkRef = useRef(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setThinking("");
    setStreaming("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target:    report.target,
          transport: report.transport,
          summary:   report.summary,
          findings:  report.findings,
          fix_list:  report.fix_list,
        }),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json();
        throw new Error(data.error || `Server error ${res.status}`);
      }

      // Read SSE stream
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop(); // keep incomplete chunk

        for (const part of parts) {
          const lines = part.trim().split("\n");
          let event = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:"))  dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;

          try {
            const payload = JSON.parse(dataStr);
            if (event === "thinking") {
              setThinking((prev) => {
                const next = prev + payload.text;
                // auto-scroll thinking box
                setTimeout(() => {
                  if (thinkRef.current) {
                    thinkRef.current.scrollTop = thinkRef.current.scrollHeight;
                  }
                }, 0);
                return next;
              });
            } else if (event === "chunk") {
              setStreaming((prev) => prev + payload.text);
            } else if (event === "done") {
              setResult(payload);
              setLoading(false);
            } else if (event === "error") {
              throw new Error(payload.error);
            }
          } catch (parseErr) {
            if (parseErr.message.startsWith("LLM")) throw parseErr;
          }
        }
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  // Group result items by status
  const grouped = {};
  (result?.items || []).forEach((it) => {
    (grouped[it.status] = grouped[it.status] || []).push(it);
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title"><span className="title-icon">🤖</span>AI Remediation Report</span>
        {result && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => exportMarkdown(result, report)}
          >
            ⬇ Export .md
          </button>
        )}
      </div>

      {/* CTA — show if not yet loaded */}
      {!result && !loading && (
        <div className="ai-cta">
          <div className="ai-model-badge">
            ✦ {MODEL_NAME}
          </div>
          <h3 className="ai-cta-title">Generate AI Remediation Report</h3>
          <p className="ai-cta-subtitle">
            The Nemotron model will analyse every finding — PASS, FAIL, and
            UNKNOWN — and produce plain-English guidance, risk ratings, and
            exact fix commands.
          </p>
          <button
            className="btn btn-primary"
            onClick={runAnalysis}
            disabled={loading}
            id="generate-ai-report-btn"
          >
            🚀 Generate AI Report
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Loading state */}
      {loading && (
        <>
          <div className="ai-progress-bar">
            <div className="ai-progress-fill" />
          </div>

          {thinking && (
            <div className="ai-thinking-box">
              <div className="ai-thinking-header">
                <div className="thinking-dot" />
                Nemotron is thinking…
              </div>
              <div className="ai-thinking-text" ref={thinkRef}>{thinking}</div>
            </div>
          )}

          {!thinking && (
            <p style={{ color: "var(--purple)", fontSize: "14px", textAlign: "center" }}>
              ✦ Connecting to NVIDIA NIM…
            </p>
          )}
        </>
      )}

      {/* Results */}
      {result && (
        <div className="ai-result">
          {/* Executive summary */}
          {result.executive_summary && (
            <div className="ai-exec-card">
              <div className="ai-exec-title">Executive Summary</div>
              <p className="ai-exec-text">{result.executive_summary}</p>

              {/* Risk score */}
              {result.risk_score != null && (
                <div className="risk-score-wrap">
                  <span className="risk-score-label">Risk Score</span>
                  <div className="risk-score-bar">
                    <div
                      className="risk-score-fill"
                      style={{
                        width: `${result.risk_score}%`,
                        background: riskColor(result.risk_score),
                      }}
                    />
                  </div>
                  <span
                    className="risk-score-value"
                    style={{ color: riskColor(result.risk_score) }}
                  >
                    {result.risk_score}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>/100</span>
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
                <div className="ai-group-label">
                  {STATUS_ICON[st]} {STATUS_LABEL[st]} ({group.length})
                </div>
                {group.map((item) => (
                  <AiItemCard key={item.rule_id} item={item} />
                ))}
              </div>
            );
          })}

          {/* Show reasoning preview if available */}
          {result.reasoning_preview && (
            <details style={{ marginTop: "20px" }}>
              <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "13px" }}>
                🧠 Show reasoning preview (first 1000 chars)
              </summary>
              <pre
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "11px",
                  color: "rgba(167,139,250,0.7)",
                  background: "rgba(167,139,250,0.05)",
                  border: "1px solid rgba(167,139,250,0.15)",
                  borderRadius: "8px",
                  padding: "14px",
                  marginTop: "10px",
                  whiteSpace: "pre-wrap",
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                {result.reasoning_preview}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Footer with regenerate button */}
      {result && (
        <div className="ai-footer">
          <button
            className="btn btn-ghost btn-sm"
            onClick={runAnalysis}
            disabled={loading}
          >
            ↺ Regenerate
          </button>
        </div>
      )}
    </section>
  );
}
