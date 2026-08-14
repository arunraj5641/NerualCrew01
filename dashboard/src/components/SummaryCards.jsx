import { useEffect, useRef, useState } from "react";

/* Animated count-up hook */
function useCountUp(target, ms = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / ms, 1);
      setVal(Math.round(p * target));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return val;
}

/* Animated SVG ring */
function Ring({ value, total, color, size = 80, stroke = 10 }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = total > 0 ? value / total : 0;
  const dash = pct * circ;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 0 6px ${color})`,
          transition: "stroke-dasharray 1s cubic-bezier(.22,.68,0,1.1)",
        }}
      />
    </svg>
  );
}

function MetricCard({ value, total, label, icon, color, cls }) {
  const count = useCountUp(value);
  const pct   = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`metric-card ${cls}`}>
      <div className="ring-wrap">
        <Ring value={value} total={total} color={color} />
        <div className="ring-center">
          <span className="ring-icon">{icon}</span>
        </div>
      </div>
      <div className="metric-info">
        <div className="metric-value">{count}</div>
        <div className="metric-label">{label}</div>
        <div className="metric-pct">{pct}% of total</div>
      </div>
    </div>
  );
}

export default function SummaryCards({ report }) {
  const s   = report.summary || {};
  const sev = report.severity_counts_failed || {};
  const pass    = s.PASS    || 0;
  const fail    = s.FAIL    || 0;
  const unknown = s.UNKNOWN || 0;
  const total   = pass + fail + unknown;

  return (
    <div>
      {/* Big metric rings */}
      <div className="metrics-grid" style={{ marginBottom: "16px" }}>
        <MetricCard value={fail}    total={total} label="FAILED"  icon="⛔" color="#f87171" cls="m-fail"    />
        <MetricCard value={pass}    total={total} label="PASSED"  icon="✅" color="#34d399" cls="m-pass"    />
        <MetricCard value={unknown} total={total} label="UNKNOWN" icon="❓" color="#fbbf24" cls="m-unknown" />
      </div>

      {/* Severity breakdown */}
      <div className="card" style={{ marginBottom: "16px" }}>
        <div className="card-inner">
          <div className="card-title">
            <span className="ct-icon">⚡</span>
            Failed by Severity
            <span className="card-subtitle">{fail} total failures</span>
          </div>
          <div className="sev-grid">
            {[
              { key: "critical", label: "Critical", cls: "s-critical" },
              { key: "high",     label: "High",     cls: "s-high"     },
              { key: "medium",   label: "Medium",   cls: "s-medium"   },
              { key: "low",      label: "Low",      cls: "s-low"      },
            ].map((s2) => (
              <div key={s2.key} className={`sev-item ${s2.cls}`}>
                <div className="sev-count">{sev[s2.key] || 0}</div>
                <div className="sev-name">{s2.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="card">
        <div className="card-inner">
          <div className="card-title">
            <span className="ct-icon">📈</span>
            Audit Summary
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {[
              { label: "Total Rules", value: total, color: "var(--cyan)" },
              { label: "Pass Rate",   value: `${total > 0 ? Math.round((pass/total)*100) : 0}%`, color: "var(--green)" },
              { label: "Fail Rate",   value: `${total > 0 ? Math.round((fail/total)*100) : 0}%`, color: "var(--red)"   },
            ].map((item) => (
              <div key={item.label} style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "16px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "28px", fontWeight: 900, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
