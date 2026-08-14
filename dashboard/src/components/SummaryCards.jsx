import { motion } from "framer-motion";
import { Shield, CheckCircle, XCircle, HelpCircle, BarChart2 } from "lucide-react";

function useCountUp(target, ms = 800) {
  const [val, setVal] = React.useState(0);
  const raf = React.useRef(null);
  React.useEffect(() => {
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

import React from "react";

function StatCard({ icon, value, label, sub, delay = 0 }) {
  const count = useCountUp(typeof value === "number" ? value : 0);
  const display = typeof value === "number" ? count : value;

  return (
    <motion.div
      className="summary-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut", delay }}
    >
      <div className="summary-card-icon">{icon}</div>
      <div className="summary-card-value">{display}</div>
      <div className="summary-card-label">{label}</div>
      {sub && <div className="summary-card-sub">{sub}</div>}
    </motion.div>
  );
}

export default function SummaryCards({ report, detailed }) {
  const s    = report.summary || {};
  const pass = s.PASS    || 0;
  const fail = s.FAIL    || 0;
  const unk  = s.UNKNOWN || 0;
  const tot  = pass + fail + unk;
  const score = tot > 0 ? Math.round((pass / tot) * 100) : 0;

  // In "overview" tab mode, show the summary row; in the detailed overview tab, show more
  return (
    <div className="summary-row">
      <StatCard
        icon={<Shield size={18} strokeWidth={1.5} />}
        value={score}
        label="Security Score"
        sub="out of 100"
        delay={0}
      />
      <StatCard
        icon={<CheckCircle size={18} strokeWidth={1.5} />}
        value={pass}
        label="Rules Passed"
        sub={`${tot > 0 ? Math.round((pass/tot)*100) : 0}% pass rate`}
        delay={0.04}
      />
      <StatCard
        icon={<XCircle size={18} strokeWidth={1.5} />}
        value={fail}
        label="Rules Failed"
        sub={`${tot > 0 ? Math.round((fail/tot)*100) : 0}% fail rate`}
        delay={0.08}
      />
      <StatCard
        icon={<HelpCircle size={18} strokeWidth={1.5} />}
        value={unk}
        label="Unknown"
        sub="could not verify"
        delay={0.12}
      />
    </div>
  );
}
