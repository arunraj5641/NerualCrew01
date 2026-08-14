import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, RefreshCw, Upload } from "lucide-react";
import SummaryCards from "./components/SummaryCards.jsx";
import FindingsTable from "./components/FindingsTable.jsx";
import FixList from "./components/FixList.jsx";
import AiReport from "./components/AiReport.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import ReportUpload from "./components/ReportUpload.jsx";
import "./styles.css";

const TABS = [
  { id: "overview",  label: "Overview"      },
  { id: "priority",  label: "Priority Queue", countKey: "fail" },
  { id: "findings",  label: "Findings",       countKey: "total" },
  { id: "ai",        label: "AI Report"      },
  { id: "evidence",  label: "Evidence"       },
];

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

export default function App() {
  const [report, setReport]     = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError]       = useState("");
  const [tab, setTab]           = useState("overview");
  const [loading, setLoading]   = useState(true);

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
    key === "total" ? total
    : key === "fail" ? (s.FAIL || 0)
    : null;

  return (
    <>
      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="header-icon">
              <Shield size={16} strokeWidth={2} />
            </div>
            <div>
              <div className="header-title">CIS Audit Agent</div>
              <div className="header-subtitle">Security compliance dashboard</div>
            </div>
          </div>

          <div className="header-right">
            {report && (
              <span className="target-badge">
                {report.target} · {report.transport}
              </span>
            )}
            {report && (
              <button
                className="btn-ghost"
                onClick={() => { setReport(null); setError(""); }}
                aria-label="Upload report"
              >
                <Upload size={13} />
                Upload
              </button>
            )}
            <button
              className="btn-scan"
              onClick={fetchReport}
              disabled={loading}
              aria-label="Run security scan"
            >
              <RefreshCw size={13} />
              {loading ? "Loading…" : "Run Security Scan"}
            </button>
          </div>
        </div>
      </header>

      {/* ── PAGE CONTENT ── */}
      <div className="layout" style={{ paddingTop: "40px", paddingBottom: "80px" }}>

        {/* Loading */}
        {loading && (
          <div className="loading-state">
            <RefreshCw size={20} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
            <span>Loading report…</span>
          </div>
        )}

        {/* No report */}
        {!loading && !report && (
          <>
            {error && (
              <div className="error-msg" style={{ maxWidth: "520px", margin: "0 auto 20px" }}>
                {error}
              </div>
            )}
            <ReportUpload
              onLoaded={(data, name) => { setReport(data); setFileName(name); setTab("overview"); }}
              onError={setError}
            />
          </>
        )}

        {/* Dashboard */}
        {!loading && report && (
          <>
            {/* Summary always visible */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <SummaryCards report={report} />
            </motion.div>

            {/* Tab nav */}
            <nav className="tab-nav" role="tablist" aria-label="Dashboard sections">
              {TABS.map((t) => {
                const count = getCount(t.countKey);
                return (
                  <button
                    key={t.id}
                    className={`tab-btn ${tab === t.id ? "active" : ""}`}
                    onClick={() => setTab(t.id)}
                    role="tab"
                    aria-selected={tab === t.id}
                  >
                    {t.label}
                    {count != null && count > 0 && (
                      <span className="tab-count">{count}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {tab === "overview" && <SummaryCards report={report} detailed />}
                {tab === "priority" && <FixList report={report} />}
                {tab === "findings" && <FindingsTable report={report} />}
                {tab === "ai"       && <AiReport report={report} />}
                {tab === "evidence" && <EvidencePanel report={report} />}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
