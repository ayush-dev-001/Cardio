import { RISK_STOPS, riskGradientCss } from "../anatomy/riskColor";

export function RiskLegend() {
  return (
    <div className="glass w-56 rounded-xl p-3 text-xs text-white/70">
      <div className="mb-1.5 font-manrope font-semibold text-white">Predicted stenosis probability</div>
      <div className="h-2.5 rounded-full" style={{ background: riskGradientCss() }} />
      <div className="mt-1 flex justify-between">
        {RISK_STOPS.map((s) => (
          <span key={s.p}>{Math.round(s.p * 100)}%</span>
        ))}
      </div>
    </div>
  );
}
