import { useState } from "react";

const STATUS_ICON  = { PASS: "✅", FAIL: "⛔", UNKNOWN: "❓" };
const STATUS_BADGE = { PASS: "b-pass", FAIL: "b-fail", UNKNOWN: "b-unknown" };
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

  if (sortBy === "severity") {
    rows = [...rows].sort((a, b) => (SEV_ORDER[a.severity_hint] ?? 9) - (SEV_ORDER[b.severity_hint] ?? 9));
  } else {
    rows = [...rows].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }

  return (
    <div>
      {/* Controls */}
      <div className="section-hdr">
        <div className="section-title"><span className="si">🔍</span> Findings</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="btn btn-ghost btn-sm"
            style={sortBy === "severity" ? { borderColor: "var(--cyan)", color: "var(--cyan)" } : {}}
            onClick={() => setSortBy((s) => s === "severity" ? "status" : "severity")}
          >
            ↕ {sortBy === "severity" ? "Severity" : "Status"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="findings-controls">
        <div className="search-input-wrap">
          <span style={{ color: "var(--text-3)", fontSize: "14px" }}>🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rule ID or title…"
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "14px" }}>✕</button>
          )}
        </div>
        <div className="filter-pills">
          {[
            { key: "ALL",     label: "All",     active: "active-all"     },
            { key: "FAIL",    label: "Failed",  active: "active-fail"    },
            { key: "PASS",    label: "Passed",  active: "active-pass"    },
            { key: "UNKNOWN", label: "Unknown", active: "active-unknown" },
          ].map(({ key, label, active }) => (
            <button
              key={key}
              className={`pill ${filter === key ? active : ""}`}
              onClick={() => setFilter(key)}
            >
              {STATUS_ICON[key] || "🔢"} {label}
              <span style={{ opacity: 0.65 }}>({counts[key] || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Finding cards */}
      {rows.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🔎</div>
          <p>No findings match your filter.</p>
        </div>
      )}

      {rows.map((f) => {
        const isOpen = expanded === f.rule_id;
        return (
          <div
            key={f.rule_id}
            className={`finding-card fc-${f.status}${isOpen ? " expanded" : ""}`}
            onClick={() => setExpanded(isOpen ? null : f.rule_id)}
          >
            <div className="finding-row">
              <div className="finding-status-dot" />
              <div className="finding-info">
                <div className="finding-rule-id">{f.rule_id}</div>
                <div className="finding-title">{f.title}</div>
              </div>
              <span className={`badge ${STATUS_BADGE[f.status] || "b-unknown"}`}>
                {STATUS_ICON[f.status]} {f.status}
              </span>
              {f.severity_hint ? (
                <span className={`sev-badge sev-${f.severity_hint}`}>{f.severity_hint}</span>
              ) : (
                <span />
              )}
              <span className="finding-expand">▼</span>
            </div>

            {isOpen && (
              <div className="finding-evidence">
                <div className="evidence-lbl">Evidence</div>
                <pre className="evidence-pre">{f.evidence || "(no evidence collected)"}</pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
