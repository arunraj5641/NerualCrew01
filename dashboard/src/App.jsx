import { useEffect, useState } from "react";
import ReportUpload from "./components/ReportUpload.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import FindingsTable from "./components/FindingsTable.jsx";
import FixList from "./components/FixList.jsx";
import AiReport from "./components/AiReport.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import "./styles.css";

const TABS = [
  { id: "overview", label: "Overview",  icon: "📊" },
  { id: "findings", label: "Findings",  icon: "🔍", countKey: "total" },
  { id: "fixes",    label: "Fix List",  icon: "🔧", countKey: "fail" },
  { id: "ai",       label: "AI Report", icon: "🤖" },
  { id: "evidence", label: "Evidence",  icon: "📋" },
];

export default function App() {
  const [report, setReport]     = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError]       = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [autoLoading, setAutoLoading] = useState(true);

  // ── Auto-load report.json from the server on mount ──────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/report");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          // 404 just means no report yet — show upload zone, not an error
          if (res.status !== 404) {
            setError(data.error || `Server error ${res.status}`);
          }
          return;
        }
        const data = await res.json();
        if (data.findings && data.summary) {
          setReport(data);
          setFileName("report.json");
        }
      } catch (e) {
        // server not reachable — silent, show upload zone
        console.warn("Could not auto-load report:", e.message);
      } finally {
        setAutoLoading(false);
      }
    };
    load();
  }, []);

  const handleLoaded = (data, name) => {
    setReport(data);
    setFileName(name);
    setError("");
    setActiveTab("overview");
  };

  const handleError = (msg) => {
    setError(msg);
    setReport(null);
  };

  const s     = report?.summary || {};
  const total = (s.PASS || 0) + (s.FAIL || 0) + (s.UNKNOWN || 0);

  // ── Refresh: re-fetch from server ───────────────────────────────────────
  const handleRefresh = async () => {
    setAutoLoading(true);
    setError("");
    try {
      const res = await fetch("/api/report");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setReport(data);
      setFileName("report.json");
    } catch (e) {
      setError(e.message);
    } finally {
      setAutoLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">🛡️</div>
        <h1>CIS Audit Dashboard</h1>
        <p className="header-tagline">
          Automatically loads <code>reports/report.json</code> from the audit
          agent. Run the agent, then refresh to see results.
        </p>
      </header>

      <main>
        {/* Spinner while auto-loading */}
        {autoLoading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-dim)" }}>
            <div style={{ fontSize: "36px", marginBottom: "16px", animation: "logoFloat 1.5s ease-in-out infinite" }}>⏳</div>
            <p style={{ fontSize: "15px" }}>Loading report…</p>
          </div>
        )}

        {!autoLoading && !report && (
          <>
            {error && <div className="error-banner">⚠️ {error}</div>}

            {/* No report on server — offer manual upload as fallback */}
            <div style={{ textAlign: "center", marginBottom: "12px" }}>
              <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "8px" }}>
                No report found on the server. Run <code>audit-agent</code> to generate one,
                or upload manually below.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={handleRefresh}>
                🔄 Retry auto-load
              </button>
            </div>

            <ReportUpload onLoaded={handleLoaded} onError={handleError} />
          </>
        )}

        {!autoLoading && report && (
          <>
            {/* Toolbar */}
            <div className="toolbar">
              <span className="file-badge">
                📄 {fileName || report.target} &nbsp;·&nbsp; {report.transport}
                &nbsp;·&nbsp; {new Date(report.generated_at).toLocaleString()}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-ghost btn-sm" onClick={handleRefresh}>
                  🔄 Refresh
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setReport(null); setError(""); }}>
                  ↑ Upload different
                </button>
              </div>
            </div>

            {error && <div className="error-banner">⚠️ {error}</div>}

            {/* Tab nav */}
            <nav className="tabs" role="tablist">
              {TABS.map((t) => {
                const count =
                  t.countKey === "total" ? total
                  : t.countKey === "fail" ? (s.FAIL || 0)
                  : null;
                return (
                  <button
                    key={t.id}
                    className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
                    onClick={() => setActiveTab(t.id)}
                    role="tab"
                    aria-selected={activeTab === t.id}
                  >
                    {t.icon} {t.label}
                    {count != null && (
                      <span className="tab-count">{count}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {activeTab === "overview"  && <SummaryCards  report={report} />}
            {activeTab === "findings"  && <FindingsTable report={report} />}
            {activeTab === "fixes"     && <FixList       report={report} />}
            {activeTab === "ai"        && <AiReport      report={report} />}
            {activeTab === "evidence"  && <EvidencePanel report={report} />}
          </>
        )}
      </main>

      <footer className="footer">
        cis-audit-agent v{report?.agent_version || "?"} &nbsp;·&nbsp;
        allowlist {report?.allowlist_version || "?"}
      </footer>
    </div>
  );
}
