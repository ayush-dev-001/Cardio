import type { VesselInfo as Info } from "../anatomy/anatomy";
import { riskColor, riskLabel } from "../anatomy/riskColor";

interface Props {
  vessel: Info;
  probability: number;
  onClose: () => void;
}

/** Minimal vessel detail card (the full panel with SHAP factors arrives in Phase 5). */
export function VesselInfo({ vessel, probability, onClose }: Props) {
  const color = riskColor(probability);
  return (
    <div className="w-72 rounded-lg border border-slate-700 bg-slate-900/90 p-4 text-sm text-slate-300 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Selected vessel</div>
          <div className="text-base font-semibold text-white">
            {vessel.name} ({vessel.id})
          </div>
        </div>
        <button onClick={onClose} className="rounded px-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold" style={{ color }}>
          {Math.round(probability * 100)}%
        </span>
        <span className="text-slate-400">{riskLabel(probability)} predicted stenosis probability</span>
      </div>
      <div className="mt-3 text-xs leading-relaxed text-slate-400">
        <span className="font-semibold text-slate-300">Supplies: </span>
        {vessel.supplies}
      </div>
    </div>
  );
}
