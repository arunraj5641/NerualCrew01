import { useState } from "react";
import ReportUpload from "./components/ReportUpload.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import FindingsTable from "./components/FindingsTable.jsx";
import FixList from "./components/FixList.jsx";
import AiReport from "./components/AiReport.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import "./styles.css";

const TABS = [
  { id: "overview",  label: "Overview",    icon: "📊" },
  { id: "findings",  label: "Findings",    icon: "🔍", countKey: "total" },
  { id: "fixes",     label: "Fix List",    icon: "🔧", countKey: "fail" },
  { id: "ai",        label: "AI Report",   icon: "🤖" },
  { id: "evidence",  label: "Evidence",    icon: "📋" },
];

export default function App() {
  const [report, setReport]   = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError]     = useState("");
  const [activeTab, setActiveTab] = useState("overview");

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

  const s = report?.summary || {};
  const total = (s.PASS || 0) + (s.FAIL || 0) + (s.UNKNOWN || 0);
  const evCount = Object.keys(report?.evidence || {}).length;

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">🛡️</div>
        <h1>CIS Audit Dashboard</h1>
        <p className="header-tagline">
          Upload a <code>report.json</code> from the audit agent, explore findings,
          and generate an AI-powered remediation report.
        </p>
      </header>

      <main>
        {!report ? (
          <>
            {error && <div className="error-banner">⚠️ {error}</div>}
            <ReportUpload onLoaded={handleLoaded} onError={handleError} />
          </>
        ) : (
          <>
            {/* Toolbar */}
            <div className="toolbar">
              <span className="file-badge">
                📄 {fileName || report.target} &nbsp;·&nbsp; {report.transport}
                &nbsp;·&nbsp; {new Date(report.generated_at).toLocaleString()}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setReport(null)}>
                ↺ Upload another
              </button>
            </div>

            {error && <div className="error-banner">⚠️ {error}</div>}

            {/* Tab nav */}
            <nav className="tabs" role="tablist">
              {TABS.map((t) => {
                const count =
                  t.countKey === "total" ? total
                  : t.countKey === "fail" ? (s.FAIL || 0)
                  : t.countKey === "ev"   ? evCount
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

            {/* Tab panels */}
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
