import { useState } from "react";
import { STATUS_LABELS } from "./SummaryCards.jsx";

const STATUS_BADGE = {
  PASS: "badge-pass",
  FAIL: "badge-fail",
  UNKNOWN: "badge-unknown",
};

export default function FindingsTable({ report }) {
  const findings = report.findings || [];
  const [filter, setFilter] = useState("ALL");

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Findings</h2>
        <div className="filter-group">
          {["ALL", "FAIL", "PASS", "UNKNOWN"].map((f) => (
            <button
              key={f}
              className={`chip filter-chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f} {f !== "ALL" && `(${report.summary[f] || 0})`}
            </button>
          ))}
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
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {findings
              .filter((f) => filter === "ALL" || f.status === filter)
              .map((f) => (
                <tr key={f.rule_id}>
                  <td className="mono">{f.rule_id}</td>
                  <td>{f.title}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[f.status] || "badge-unknown"}`}>
                      {STATUS_LABELS[f.status] || f.status}
                    </span>
                  </td>
                  <td>
                    {f.severity_hint ? (
                      <span className={`chip sev-chip ${f.severity_hint}`}>
                        {f.severity_hint}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="evidence-cell" title={f.evidence}>
                    {f.evidence}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
