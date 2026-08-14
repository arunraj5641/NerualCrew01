import { useEffect, useRef, useState } from "react";

const R  = 70;   // circle radius
const CX = 90;   // centre x
const CY = 90;   // centre y
const CIRC = 2 * Math.PI * R;

function DonutChart({ pass, fail, unknown }) {
  const total = pass + fail + unknown || 1;

  const segments = [
    { value: fail,    color: "#f87171", label: "FAIL" },
    { value: unknown, color: "#fbbf24", label: "UNKNOWN" },
    { value: pass,    color: "#22c55e", label: "PASS" },
  ];

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct   = seg.value / total;
    const dash  = pct * CIRC;
    const gap   = CIRC - dash;
    const rotate = (offset / total) * 360;
    offset += seg.value;
    return { ...seg, dash, gap, rotate };
  });

  return (
    <div className="donut-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180">
        {/* Track */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#0b1628" strokeWidth="18" />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={arc.color}
            strokeWidth="18"
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={0}
            transform={`rotate(${arc.rotate - 90} ${CX} ${CY})`}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="donut-center">
        <div className="donut-total">{pass + fail + unknown}</div>
        <div className="donut-label">rules</div>
      </div>
    </div>
  );
}

function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);
  const frame = useRef(null);

  useEffect(() => {
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setCount(Math.round(progress * target));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return count;
}

function AnimatedCard({ value, label, icon, cls }) {
  const count = useCountUp(value);
  return (
    <div className={`summary-card ${cls}`}>
      <div className="card-icon">{icon}</div>
      <div className="card-value">{count}</div>
      <div className="card-label">{label}</div>
    </div>
  );
}

export default function SummaryCards({ report }) {
  const s   = report.summary || {};
  const sev = report.severity_counts_failed || {};
  const pass    = s.PASS    || 0;
  const fail    = s.FAIL    || 0;
  const unknown = s.UNKNOWN || 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title"><span className="title-icon">📊</span>Overview</span>
      </div>

      <div className="summary-layout">
        <DonutChart pass={pass} fail={fail} unknown={unknown} />

        <div>
          <div className="summary-cards">
            <AnimatedCard value={pass}    label="Passed"  icon="✅" cls="card-pass" />
            <AnimatedCard value={fail}    label="Failed"  icon="⛔" cls="card-fail" />
            <AnimatedCard value={unknown} label="Unknown" icon="❓" cls="card-unknown" />
          </div>

          <div className="sev-bar">
            <span className="sev-bar-label">Failed by severity:</span>
            {["critical", "high", "medium", "low"].map((s) => (
              <span key={s} className={`sev-chip ${s}`}>
                {sev[s] || 0} {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
