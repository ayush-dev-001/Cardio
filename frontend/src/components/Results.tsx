import { ArrowDown, ArrowUp } from "lucide-react";
import type { PredictResponse, Schema, TargetPrediction } from "../api/types";
import { riskColor } from "../anatomy/riskColor";
import { formatPct } from "../lib/waterfall";
import { AnimatedNumber } from "./AnimatedNumber";
import { MODEL_NAMES, Panel, RiskChip } from "./ui";

/** Probability track with the decision-threshold tick. Fill colour = the same risk scale as 3D. */
function ProbabilityTrack({ p, threshold, height = "h-2" }: { p: number; threshold: number; height?: string }) {
  return (
    <div className={`relative ${height} w-full rounded-full bg-white/10`}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
        style={{ width: `${p * 100}%`, background: riskColor(p) }}
      />
      <div
        className="absolute -inset-y-1 w-0.5 rounded bg-white"
        style={{ left: `calc(${threshold * 100}% - 1px)` }}
        title={`Decision threshold ${formatPct(threshold)}`}
      />
    </div>
  );
}

const sensitivityGoal = (schema: Schema, targetId: string) => {
  const r = schema.targets.find((x) => x.id === targetId)?.min_recall;
  return r ? ` (tuned for ≥${Math.round(r * 100)}% sensitivity)` : "";
};

/** Change vs the baseline patient in percentage points (icon + sign, never colour alone). */
export function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  const d = Math.round((now - before) * 100);
  if (d === 0) return <span className="text-[11px] text-slate-500">±0 pts</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-medium ${d > 0 ? "text-red-300" : "text-sky-300"}`} title="Change vs baseline">
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

export function CadStatusCard({ cad, schema, baseline }: { cad: TargetPrediction; schema: Schema; baseline?: number }) {
  return (
    <Panel title="Overall coronary artery disease" right={<RiskChip level={cad.risk_level} suffix=" risk" />}>
      <div className="flex items-end gap-3">
        <span className="font-manrope text-5xl font-bold tabular-nums text-white">
          <AnimatedNumber value={cad.probability} format={formatPct} />
        </span>
        <span className="pb-1 text-sm text-slate-300">
          <Delta now={cad.probability} before={baseline} />{" "}
          {cad.predicted_positive ? "CAD likely: above the decision threshold" : "CAD unlikely: below the decision threshold"}
        </span>
      </div>
      <div className="mt-3">
        <ProbabilityTrack p={cad.probability} threshold={cad.threshold} height="h-2.5" />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>0%</span>
          <span>
            threshold {formatPct(cad.threshold)}
            {sensitivityGoal(schema, cad.target_id)}
          </span>
          <span>100%</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{cvText(schema, cad.target_id)}</p>
    </Panel>
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
    <Panel title="Stenosis probability per vessel" right={<span className="text-[11px] text-slate-500">click to inspect</span>}>
      <ul className="space-y-1">
        {prediction.vessels.map((v) => {
          const info = schema.vessels.find((x) => x.id === v.vessel_id);
          const selected = selectedId === v.vessel_id;
          return (
            <li key={v.vessel_id}>
              <button
                onClick={() => onSelect(v.vessel_id)}
                aria-pressed={selected}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected ? "border-primary/70 bg-primary/10" : "border-transparent hover:border-white/15 hover:bg-white/[0.03]"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-200">
                    <span className="font-semibold text-white">{v.vessel_id}</span>{" "}
                    <span className="text-xs text-slate-400">{info?.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Delta now={v.probability} before={baseline?.vessels.find((b) => b.vessel_id === v.vessel_id)?.probability} />
                    {v.predicted_positive && <span className="text-[11px] text-slate-300">above threshold</span>}
                    <span className="w-10 text-right text-sm font-semibold tabular-nums text-white">
                      <AnimatedNumber value={v.probability} format={formatPct} />
                    </span>
                  </span>
                </div>
                <ProbabilityTrack p={v.probability} threshold={v.threshold} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        White tick = decision threshold{sensitivityGoal(schema, prediction.vessels[0].target_id)}. Bar colours match the 3D view. Per-vessel status only,
        not lesion location.
      </p>
    </Panel>
  );
}
