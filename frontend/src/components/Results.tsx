import { ArrowDown, ArrowUp, ChevronRight, HeartPulse } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { PredictResponse, Schema, TargetPrediction } from "../api/types";
import { riskColor } from "../anatomy/riskColor";
import { cn } from "../lib/cn";
import { formatPct } from "../lib/waterfall";
import { AnimatedNumber } from "./AnimatedNumber";
import { Card, CardHeader } from "./primitives";
import { MODEL_NAMES, RiskChip } from "./ui";

/** Probability track with the decision-threshold tick. Fill colour = the same risk scale as 3D. */
function ProbabilityTrack({ p, threshold, height = "h-2" }: { p: number; threshold: number; height?: string }) {
  return (
    <div className={cn("relative w-full rounded-full bg-white/[0.08]", height)}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
        style={{ width: `${p * 100}%`, background: riskColor(p), boxShadow: `0 0 12px ${riskColor(p)}55` }}
      />
      <div className="absolute -inset-y-1 w-0.5 rounded bg-white/90" style={{ left: `calc(${threshold * 100}% - 1px)` }} title={`Decision threshold ${formatPct(threshold)}`} />
    </div>
  );
}

const sensitivityGoal = (schema: Schema, targetId: string) => {
  const r = schema.targets.find((x) => x.id === targetId)?.min_recall;
  return r ? `tuned for ≥${Math.round(r * 100)}% sensitivity` : "";
};

/** Change vs the baseline patient in percentage points (icon + sign, never colour alone). */
export function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  const d = Math.round((now - before) * 100);
  if (d === 0) return <span className="text-[11px] text-white/40">±0 pts</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-medium", d > 0 ? "text-red-300" : "text-sky-300")} title="Change vs baseline">
      {d > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
      {d > 0 ? "+" : "−"}
      {Math.abs(d)} pts
    </span>
  );
}

function cvText(schema: Schema, targetId: string) {
  const t = schema.targets.find((x) => x.id === targetId);
  if (!t) return "";
  const auc = t.cv_roc_auc ? ` · CV AUC ${t.cv_roc_auc.mean.toFixed(2)} (95% CI ${t.cv_roc_auc.ci_low.toFixed(2)}–${t.cv_roc_auc.ci_high.toFixed(2)})` : "";
  return `${MODEL_NAMES[t.model] ?? t.model}${auc}`;
}

/** Semicircular risk gauge: arc fill animates to the probability; the white tick marks the threshold. */
function Gauge({ p, threshold }: { p: number; threshold: number }) {
  const reduce = useReducedMotion();
  const R = 80;
  const arc = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;
  const angle = Math.PI * (1 - threshold);
  const tick = [100 + Math.cos(angle) * (R - 12), 100 - Math.sin(angle) * (R - 12), 100 + Math.cos(angle) * (R + 12), 100 - Math.sin(angle) * (R + 12)];
  const color = riskColor(p);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px]" role="img" aria-label={`CAD probability ${formatPct(p)}, threshold ${formatPct(threshold)}`}>
      <defs>
        <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={arc} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} strokeLinecap="round" />
      <motion.path
        d={arc}
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
        filter="url(#gauge-glow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: Math.max(0.001, p), stroke: color }}
        transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <line x1={tick[0]} y1={tick[1]} x2={tick[2]} y2={tick[3]} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export function CadStatusCard({ cad, schema, baseline }: { cad: TargetPrediction; schema: Schema; baseline?: number }) {
  return (
    <Card>
      <CardHeader
        icon={<HeartPulse className="h-4 w-4" aria-hidden />}
        title="Overall coronary artery disease"
        subtitle={cvText(schema, cad.target_id)}
        action={<RiskChip level={cad.risk_level} suffix=" risk" />}
      />
      <div className="flex flex-col items-center px-5 pb-5 pt-2">
        <div className="relative w-full max-w-[260px]">
          <Gauge p={cad.probability} threshold={cad.threshold} />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="font-manrope text-5xl font-bold leading-none tabular-nums text-white">
              <AnimatedNumber value={cad.probability} format={formatPct} />
            </span>
            <span className="mt-1.5 h-4">
              <Delta now={cad.probability} before={baseline} />
            </span>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-white/80">
          {cad.predicted_positive ? "CAD likely: above the decision threshold" : "CAD unlikely: below the decision threshold"}
        </p>
        <p className="mt-1 text-center text-[11px] text-white/45">
          White tick = threshold {formatPct(cad.threshold)} ({sensitivityGoal(schema, cad.target_id)})
        </p>
      </div>
    </Card>
  );
}

export function VesselBars({
  prediction,
  schema,
  selectedId,
  onSelect,
  baseline,
}: {
  baseline?: PredictResponse | null;
  prediction: PredictResponse;
  schema: Schema;
  selectedId: string | null;
  onSelect: (vesselId: string) => void;
}) {
  return (
    <Card>
      <CardHeader title="Stenosis probability per vessel" subtitle="Select a vessel to inspect it in 3D" />
      <ul className="space-y-1.5 p-3">
        {prediction.vessels.map((v, i) => {
          const info = schema.vessels.find((x) => x.id === v.vessel_id);
          const selected = selectedId === v.vessel_id;
          return (
            <motion.li key={v.vessel_id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              <button
                onClick={() => onSelect(v.vessel_id)}
                aria-pressed={selected}
                className={cn(
                  "group w-full rounded-xl border px-3.5 py-3 text-left transition-colors duration-200",
                  selected ? "border-primary/60 bg-primary/10" : "border-white/[0.06] bg-surface-2 hover:border-white/15",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="font-manrope text-sm font-bold text-white">{v.vessel_id}</span>
                    <span className="truncate text-xs text-white/50">{info?.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Delta now={v.probability} before={baseline?.vessels.find((b) => b.vessel_id === v.vessel_id)?.probability} />
                    <span className="w-11 text-right font-manrope text-base font-bold tabular-nums text-white">
                      <AnimatedNumber value={v.probability} format={formatPct} />
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
                <ProbabilityTrack p={v.probability} threshold={v.threshold} />
                <div className="mt-1.5 flex justify-between text-[11px] text-white/45">
                  <span>{v.predicted_positive ? "Above decision threshold" : "Below decision threshold"}</span>
                  <span>threshold {formatPct(v.threshold)}</span>
                </div>
              </button>
            </motion.li>
          );
        })}
      </ul>
      <p className="px-5 pb-4 text-[11px] leading-relaxed text-white/45">
        Thresholds {sensitivityGoal(schema, prediction.vessels[0].target_id)}. Colours match the 3D view. Per-vessel status only, not lesion
        location.
      </p>
    </Card>
  );
}
