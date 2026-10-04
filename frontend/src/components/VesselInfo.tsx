import { ArrowDown, ArrowRight, ArrowUp, X } from "lucide-react";
import type { TargetExplanation, TargetPrediction, VesselSchema } from "../api/types";
import { riskColor } from "../anatomy/riskColor";
import { formatPct } from "../lib/waterfall";
import { LOWERS, RAISES } from "./ShapWaterfall";
import { MODEL_NAMES, RiskChip } from "./ui";

interface Props {
  vessel: VesselSchema;
  prediction: TargetPrediction | null;
  explanation: TargetExplanation | null;
  onShowExplanation: () => void;
  onClose: () => void;
}

/** Vessel detail panel, opened by clicking an artery in the 3D view (or its probability bar). */
export function VesselInfo({ vessel, prediction, explanation, onShowExplanation, onClose }: Props) {
  const p = prediction?.probability ?? null;
  const sorted = explanation ? [...explanation.contributions].sort((a, b) => b.shap - a.shap) : [];
  const raising = sorted.filter((c) => c.shap > 0).slice(0, 3);
  const lowering = sorted.filter((c) => c.shap < 0).reverse().slice(0, 2);

  return (
    <div className="glass-strong w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl p-5 text-sm text-white/80 shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected vessel</div>
          <div className="font-serif text-2xl leading-tight text-white">
            {vessel.name} ({vessel.id})
          </div>
        </div>
        <button onClick={onClose} className="rounded px-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close vessel details">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {p !== null && prediction && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ background: riskColor(p) }} aria-hidden />
            <span className="font-manrope text-4xl font-bold tabular-nums text-white">{formatPct(p)}</span>
            <RiskChip level={prediction.risk_level} />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Predicted stenosis probability ({prediction.predicted_positive ? "above" : "below"} the {formatPct(prediction.threshold)} threshold) ·{" "}
            {MODEL_NAMES[prediction.model] ?? prediction.model}
          </p>
        </>
      )}

      {explanation && (
        <div className="mt-3 space-y-2 text-xs">
          <div>
            <div className="mb-1 font-semibold text-slate-200">Main factors raising risk</div>
            {raising.length ? (
              <ul className="space-y-0.5">
                {raising.map((c) => (
                  <li key={c.feature} className="flex justify-between gap-2">
                    <span>
                      <ArrowUp className="mr-1 inline h-3.5 w-3.5" style={{ color: RAISES }} aria-hidden />
                      {c.label}
                    </span>
                    <span className="text-slate-400">{c.display_value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">None</p>
            )}
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-200">Main factors lowering risk</div>
            <ul className="space-y-0.5">
              {lowering.map((c) => (
                <li key={c.feature} className="flex justify-between gap-2">
                  <span>
                    <ArrowDown className="mr-1 inline h-3.5 w-3.5" style={{ color: LOWERS }} aria-hidden />
                    {c.label}
                  </span>
                  <span className="text-slate-400">{c.display_value}</span>
                </li>
              ))}
            </ul>
          </div>
          <button onClick={onShowExplanation} className="inline-flex min-h-9 items-center font-medium text-brand-300 hover:text-white">
            Full explanation <ArrowRight className="ml-0.5 inline h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div className="mt-3 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-400">
        <span className="font-semibold text-slate-300">Supplies: </span>
        {vessel.supplies}
      </div>
    </div>
  );
}
