import { useEffect, useState } from "react";
import SummaryCards from "./components/SummaryCards.jsx";
import FindingsTable from "./components/FindingsTable.jsx";
import FixList from "./components/FixList.jsx";
import AiReport from "./components/AiReport.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import ReportUpload from "./components/ReportUpload.jsx";
import "./styles.css";

const NAV = [
  { id: "overview",  icon: "📊", label: "Overview"  },
  { id: "findings",  icon: "🔍", label: "Findings",  countKey: "total" },
  { id: "fixes",     icon: "🔧", label: "Fix List",  countKey: "fail"  },
  { id: "ai",        icon: "🤖", label: "AI Report" },
  { id: "evidence",  icon: "📋", label: "Evidence"  },
];

export default function App() {
  const [report, setReport]       = useState(null);
  const [fileName, setFileName]   = useState("");
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("overview");
  const [loading, setLoading]     = useState(true);

  /* Auto-load report.json from server */
  useEffect(() => { fetchReport(); }, []);

  const fetchReport = async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/report");
      const data = await res.json();
      if (res.ok && data.findings && data.summary) {
        setReport(data);
        setFileName("report.json");
      } else if (res.status !== 404) {
        setError(data.error || "Failed to load report");
      }
    } catch (e) {
      console.warn("Auto-load failed:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const s     = report?.summary || {};
  const total = (s.PASS || 0) + (s.FAIL || 0) + (s.UNKNOWN || 0);

  const getCount = (key) =>
    key === "total" ? total : key === "fail" ? (s.FAIL || 0) : null;

  /* Topbar label */
  const PAGE_TITLE = {
    overview: "Overview",
    findings: "Findings",
    fixes:    "Fix List",
    ai:       "AI Report",
    evidence: "Evidence Appendix",
  };

  return (
    <>
      {/* Animated background layers */}
      <div className="bg-mesh" />
      <div className="bg-grid" />

      <div className="shell">
        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-icon">🛡️</div>
            <div className="logo-text">
              <span className="logo-title">CIS AUDIT</span>
              <span className="logo-sub">Dashboard</span>
            </div>
          </div>

          {/* Target info */}
          {report && (
            <div className="target-pill">
              <div className="label">Target</div>
              <div className="value">{report.target || "—"}</div>
              <div className="meta">{report.transport} · {new Date(report.generated_at).toLocaleDateString()}</div>
            </div>
          )}

          {/* Nav */}
          <nav className="sidebar-nav">
            {NAV.map((n) => {
              const count = getCount(n.countKey);
              return (
                <button
                  key={n.id}
                  className={`nav-item ${tab === n.id && report ? "active" : ""}`}
                  onClick={() => report && setTab(n.id)}
                  disabled={!report}
                  style={!report ? { opacity: 0.35, cursor: "default" } : {}}
                >
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                  {count != null && count > 0 && (
                    <span className={`nav-badge ${n.countKey === "fail" ? "fail" : ""}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="version-chip">
              v{report?.agent_version || "?"} · allowlist {report?.allowlist_version || "?"}
            </div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div className="main-content">
          {/* Topbar */}
          <header className="topbar">
            <div className="topbar-title">
              {report && <div className="dot" />}
              {report ? PAGE_TITLE[tab] : "CIS Audit Dashboard"}
            </div>
            <div className="topbar-actions">
              {error && <span style={{ color: "var(--red)", fontSize: "13px" }}>⚠️ {error}</span>}
              {report && (
                <button className="btn btn-ghost btn-sm" onClick={fetchReport}>
                  🔄 Refresh
                </button>
              )}
              {report && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setReport(null); setError(""); }}>
                  ↑ Upload
                </button>
              )}
            </div>
          </header>

          {/* Page content */}
          <main className="page">
            {/* Loading */}
            {loading && (
              <div className="empty-state">
                <div className="empty-icon" style={{ animation: "aiFloat 1.5s ease-in-out infinite" }}>⏳</div>
                <p>Loading report…</p>
              </div>
            )}

            {/* No report state */}
            {!loading && !report && (
              <div className="upload-state">
                {error && <div className="error-banner" style={{ marginBottom: "20px", maxWidth: "520px" }}>⚠️ {error}</div>}
                <div className="no-report-msg">
                  <p>No report found on the server. Run <code>audit-agent</code> to generate one, or upload manually.</p>
                  <button className="btn btn-ghost btn-sm" onClick={fetchReport} style={{ marginBottom: "20px" }}>
                    🔄 Retry auto-load
                  </button>
                </div>
                <ReportUpload
                  onLoaded={(data, name) => { setReport(data); setFileName(name); setTab("overview"); }}
                  onError={setError}
                />
              </div>
            )}

            {/* Dashboard tabs */}
            {!loading && report && (
              <>
                {tab === "overview"  && <SummaryCards  report={report} />}
                {tab === "findings"  && <FindingsTable report={report} />}
                {tab === "fixes"     && <FixList       report={report} />}
                {tab === "ai"        && <AiReport      report={report} />}
                {tab === "evidence"  && <EvidencePanel report={report} />}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
