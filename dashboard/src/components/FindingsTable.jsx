import { useState } from "react";

const STATUS_BADGE = {
  PASS:    "badge-pass",
  FAIL:    "badge-fail",
  UNKNOWN: "badge-unknown",
};

const STATUS_ICON = { PASS: "✅", FAIL: "⛔", UNKNOWN: "❓" };

export default function FindingsTable({ report }) {
  const findings   = report.findings || [];
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [sortBy, setSortBy]   = useState(null); // "status" | "severity"
  const [expanded, setExpanded] = useState(null);

  const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER = { FAIL: 0, UNKNOWN: 1, PASS: 2 };

  let rows = findings.filter((f) => {
    const matchFilter = filter === "ALL" || f.status === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      f.rule_id?.toLowerCase().includes(q) ||
      f.title?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  if (sortBy === "severity") {
    rows = [...rows].sort(
      (a, b) => (SEV_ORDER[a.severity_hint] ?? 9) - (SEV_ORDER[b.severity_hint] ?? 9)
    );
  } else if (sortBy === "status") {
    rows = [...rows].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    );
  }

  const counts = { ALL: findings.length };
  findings.forEach((f) => {
    counts[f.status] = (counts[f.status] || 0) + 1;
  });

  const toggleExpand = (ruleId) =>
    setExpanded((prev) => (prev === ruleId ? null : ruleId));

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title"><span className="title-icon">🔍</span>Findings</span>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Sort buttons */}
          <button
            className={`btn btn-ghost btn-sm`}
            style={sortBy === "severity" ? { borderColor: "var(--cyan)", color: "var(--cyan)" } : {}}
            onClick={() => setSortBy((s) => (s === "severity" ? null : "severity"))}
          >
            ↕ Severity
          </button>
          <button
            className={`btn btn-ghost btn-sm`}
            style={sortBy === "status" ? { borderColor: "var(--cyan)", color: "var(--cyan)" } : {}}
            onClick={() => setSortBy((s) => (s === "status" ? null : "status"))}
          >
            ↕ Status
          </button>
        </div>
      </div>

      {/* Filters + Search */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "18px", flexWrap: "wrap" }}>
        <div className="filter-group">
          {["ALL", "FAIL", "PASS", "UNKNOWN"].map((f) => (
            <button
              key={f}
              className={`filter-chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {STATUS_ICON[f] || "🔢"} {f}
              <span style={{ opacity: 0.7 }}>({counts[f] || 0})</span>
            </button>
          ))}
        </div>

        <div className="search-bar">
          <span className="search-icon">🔎</span>
          <input
            type="text"
            placeholder="Search rule ID or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px" }}
            >✕</button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="findings-table">
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Evidence (preview)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="nothing-found">No findings match your filter.</td>
              </tr>
            )}
            {rows.map((f) => {
              const isExpanded = expanded === f.rule_id;
              return (
                <>
                  <tr
                    key={f.rule_id}
                    className={`status-${f.status}${isExpanded ? " expanded" : ""}`}
                    onClick={() => toggleExpand(f.rule_id)}
                  >
                    <td><span className="rule-id">{f.rule_id}</span></td>
                    <td style={{ maxWidth: "260px", fontWeight: 500 }}>{f.title}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[f.status] || "badge-unknown"}`}>
                        {STATUS_ICON[f.status]} {f.status}
                      </span>
                    </td>
                    <td>
                      {f.severity_hint ? (
                        <span className={`sev-chip ${f.severity_hint}`}>{f.severity_hint}</span>
                      ) : "—"}
                    </td>
                    <td className="evidence-cell" title={f.evidence}>{f.evidence}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                      {isExpanded ? "▲" : "▼"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${f.rule_id}-expand`} className="expand-row">
                      <td colSpan={6}>
                        <div className="expand-content">
                          <div className="expand-label">Full Evidence</div>
                          <pre className="evidence-pre">{f.evidence || "(no evidence)"}</pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
