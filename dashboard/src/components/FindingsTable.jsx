import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, HelpCircle, ChevronDown, Search, X } from "lucide-react";

const STATUS_ICON = {
  PASS:    <CheckCircle  size={15} strokeWidth={2} />,
  FAIL:    <XCircle      size={15} strokeWidth={2} />,
  UNKNOWN: <HelpCircle   size={15} strokeWidth={2} />,
};

const SEV_ORDER    = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER = { FAIL: 0, UNKNOWN: 1, PASS: 2 };

export default function FindingsTable({ report }) {
  const findings = report.findings || [];
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [sortBy, setSortBy]     = useState("status");
  const [expanded, setExpanded] = useState(null);

  const counts = { ALL: findings.length };
  findings.forEach((f) => { counts[f.status] = (counts[f.status] || 0) + 1; });

  let rows = findings.filter((f) => {
    const matchFilter = filter === "ALL" || f.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || f.rule_id?.toLowerCase().includes(q) || f.title?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  rows = [...rows].sort((a, b) =>
    sortBy === "severity"
      ? (SEV_ORDER[a.severity_hint] ?? 9) - (SEV_ORDER[b.severity_hint] ?? 9)
      : (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );

  const FILTERS = [
    { key: "ALL",     label: "All" },
    { key: "FAIL",    label: "Failed" },
    { key: "PASS",    label: "Passed" },
    { key: "UNKNOWN", label: "Unknown" },
  ];

  return (
    <div>
      <div className="section-hdr">
        <h2 className="section-title">Findings</h2>
        <span className="section-subtitle">{rows.length} results</span>
      </div>

      <div className="findings-controls">
        <div className="search-wrap">
          <Search size={14} strokeWidth={2} color="var(--text-3)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rule ID or title…"
            aria-label="Search findings"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", display: "flex" }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="filter-pills">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-pill ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {label}
              <span style={{ opacity: 0.5, fontSize: "11px" }}>({counts[key] || 0})</span>
            </button>
          ))}
        </div>

        <button
          className="btn-ghost"
          style={{ marginLeft: "auto", fontSize: "12px" }}
          onClick={() => setSortBy((s) => s === "severity" ? "status" : "severity")}
        >
          Sort: {sortBy === "severity" ? "Severity" : "Status"}
        </button>
      </div>

      {rows.length === 0 && (
        <div className="empty-state">No findings match your filter.</div>
      )}

      <div className="finding-cards">
        {rows.map((f, i) => {
          const isOpen = expanded === f.rule_id;
          return (
            <motion.div
              key={f.rule_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(i * 0.03, 0.3) }}
            >
              <div
                className={`finding-card ${f.status === "FAIL" ? "fc-fail" : ""} ${isOpen ? "open" : ""}`}
                onClick={() => setExpanded(isOpen ? null : f.rule_id)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onKeyDown={(e) => e.key === "Enter" && setExpanded(isOpen ? null : f.rule_id)}
              >
                <div className="finding-row">
                  <span
                    className={`finding-status-icon status-${f.status?.toLowerCase()}`}
                    style={{ opacity: f.status === "UNKNOWN" ? 0.4 : 1 }}
                  >
                    {STATUS_ICON[f.status]}
                  </span>
                  <span className="finding-rule-id">{f.rule_id}</span>
                  <span className="finding-title">{f.title}</span>
                  {f.severity_hint && (
                    <span className="finding-sev">{f.severity_hint}</span>
                  )}
                  <ChevronDown
                    size={15}
                    strokeWidth={2}
                    className="finding-chevron"
                    style={{ opacity: 0.4 }}
                  />
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="finding-body" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <div className="finding-section-label">Evidence</div>
                          <pre className="finding-evidence-pre">
                            {f.evidence || "(no evidence collected)"}
                          </pre>
                        </div>
                        <div>
                          <div className="finding-section-label">Status</div>
                          <div style={{ color: "var(--text-2)", fontSize: "13px", marginBottom: "12px" }}>
                            {f.status === "PASS"    && "This control is satisfied."}
                            {f.status === "FAIL"    && "This control failed and requires remediation."}
                            {f.status === "UNKNOWN" && "Could not be verified on this run."}
                          </div>
                          {f.severity_hint && (
                            <>
                              <div className="finding-section-label">Severity</div>
                              <div style={{ color: "var(--text-2)", fontSize: "13px", textTransform: "capitalize" }}>
                                {f.severity_hint}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
