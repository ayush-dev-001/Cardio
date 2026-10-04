import { RISK_STOPS, riskGradientCss } from "../anatomy/riskColor";

export function RiskLegend() {
  return (
    <div className="w-56 rounded-lg border border-slate-700 bg-slate-900/85 p-3 text-xs text-slate-300 backdrop-blur">
      <div className="mb-1.5 font-semibold text-slate-100">Predicted stenosis probability</div>
      <div className="h-2.5 rounded-full" style={{ background: riskGradientCss() }} />
      <div className="mt-1 flex justify-between">
        {RISK_STOPS.map((s) => (
          <span key={s.p}>{Math.round(s.p * 100)}%</span>
        ))}
      </div>
    </div>
  );
}
