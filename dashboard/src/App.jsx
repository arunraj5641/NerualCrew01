import { useState } from "react";
import ReportUpload from "./components/ReportUpload.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import FindingsTable from "./components/FindingsTable.jsx";
import FixList from "./components/FixList.jsx";
import AiReport from "./components/AiReport.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";

const SEVERITY_COLORS = {
  critical: "sev-critical",
  high: "sev-high",
  medium: "sev-medium",
  low: "sev-low",
};

export default function App() {
  const [report, setReport] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const handleLoaded = (data, name) => {
    setReport(data);
    setFileName(name);
    setError("");
  };

  const handleError = (msg) => {
    setError(msg);
    setReport(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>
          <span className="logo">🛡️</span> CIS Audit Dashboard
        </h1>
        <p className="tagline">
          Upload a <code>report.json</code> from the audit agent, review the
          findings, and get an AI-driven remediation report.
        </p>
      </header>

      <main className="content">
        {!report ? (
          <ReportUpload onLoaded={handleLoaded} onError={handleError} />
        ) : (
          <>
            <div className="toolbar">
              <span className="file-badge">
                {fileName || report.target} · {report.transport} ·{" "}
                {report.generated_at}
              </span>
              <button className="btn ghost" onClick={() => setReport(null)}>
                ↺ Upload another report
              </button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <SummaryCards report={report} />
            <FindingsTable report={report} />
            <FixList report={report} />
            <AiReport report={report} />
            <EvidencePanel report={report} />
          </>
        )}
      </main>

      <footer className="footer">
        cis-audit-agent v{report?.agent_version || "?"} · allowlist{" "}
        {report?.allowlist_version || "?"}
      </footer>
    </div>
  );
}

export { SEVERITY_COLORS };
