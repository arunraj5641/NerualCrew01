import { useState } from "react";

export default function AiReport({ report }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const runAnalysis = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: report.target,
          transport: report.transport,
          summary: report.summary,
          findings: report.findings,
          fix_list: report.fix_list,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>🤖 AI Remediation Report</h2>
        <button
          className="btn primary"
          onClick={runAnalysis}
          disabled={loading}
        >
          {loading ? "Analyzing…" : "Generate AI Report"}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="ai-loading">Calling LLM… this takes ~10-30s.</p>}
      {result && <AiResultView data={result} />}
    </section>
  );
}

function AiResultView({ data }) {
  const items = data.items || [];
  const executive = data.executive_summary || "";

  return (
    <div className="ai-result">
      {executive && (
        <div className="ai-block ai-exec">
          <h3>Executive Summary</h3>
          <p>{executive}</p>
        </div>
      )}
      {items.length === 0 && (
        <p className="nothing-to-fix">
          No FAIL findings — nothing for the AI to prioritize.
        </p>
      )}
      {items.map((it) => (
        <div className="ai-block" key={it.rule_id}>
          <h4>
            <span className="mono">{it.rule_id}</span>{" "}
            <span className={`chip sev-chip ${it.severity_hint}`}>
              {it.severity_hint}
            </span>
          </h4>
          <p className="fix-finding">{it.finding}</p>
          <p className="fix-why">
            <strong>Why it matters:</strong> {it.why_it_matters}
          </p>
          <pre className="fix-command">
            <code>{it.fix_command}</code>
          </pre>
          {it.risk_assessment && (
            <p className="fix-why">
              <strong>Risk:</strong> {it.risk_assessment}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
