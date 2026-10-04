import type { PredictResponse, Schema, TargetPrediction } from "../api/types";
import { riskColor } from "../anatomy/riskColor";
import { formatPct } from "../lib/waterfall";
import { MODEL_NAMES, Panel, RiskChip } from "./ui";

/** Probability track with the decision-threshold tick. Fill colour = the same risk scale as 3D. */
function ProbabilityTrack({ p, threshold, height = "h-2" }: { p: number; threshold: number; height?: string }) {
  return (
    <div className={`relative ${height} w-full rounded-full bg-slate-800`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p * 100}%`, background: riskColor(p) }} />
      <div
        className="absolute -inset-y-1 w-0.5 rounded bg-slate-200"
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

function cvText(schema: Schema, targetId: string) {
  const t = schema.targets.find((x) => x.id === targetId);
  if (!t) return "";
  const auc = t.cv_roc_auc ? ` · CV AUC ${t.cv_roc_auc.mean.toFixed(2)} (95% CI ${t.cv_roc_auc.ci_low.toFixed(2)}–${t.cv_roc_auc.ci_high.toFixed(2)})` : "";
  return `${MODEL_NAMES[t.model] ?? t.model}${auc}`;
}

export function CadStatusCard({ cad, schema }: { cad: TargetPrediction; schema: Schema }) {
  return (
    <Panel title="Overall coronary artery disease" right={<RiskChip level={cad.risk_level} suffix=" risk" />}>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold tabular-nums text-white">{formatPct(cad.probability)}</span>
        <span className="pb-1 text-sm text-slate-300">
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
}: {
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
                  selected ? "border-sky-400/70 bg-sky-500/10" : "border-transparent hover:border-slate-700 hover:bg-slate-800/40"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-200">
                    <span className="font-semibold text-white">{v.vessel_id}</span>{" "}
                    <span className="text-xs text-slate-400">{info?.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {v.predicted_positive && <span className="text-[11px] text-slate-300">▲ above threshold</span>}
                    <span className="w-10 text-right text-sm font-semibold tabular-nums text-white">{formatPct(v.probability)}</span>
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
