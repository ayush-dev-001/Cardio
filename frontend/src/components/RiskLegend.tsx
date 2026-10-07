import { RISK_STOPS, riskGradientCss } from "../anatomy/riskColor";

export function RiskLegend({ territories = false }: { territories?: boolean }) {
  return (
    <div className="glass w-56 rounded-xl p-3 text-xs text-white/70">
      <div className="mb-1.5 font-manrope font-semibold text-white">Predicted stenosis probability</div>
      <div className="h-2.5 rounded-full" style={{ background: riskGradientCss() }} />
      <div className="mt-1 flex justify-between">
        {RISK_STOPS.map((s) => (
          <span key={s.p}>{Math.round(s.p * 100)}%</span>
        ))}
      </div>
      {territories && (
        <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-snug text-white/55">
          Shaded muscle: the area each artery typically supplies, tinted by that artery's risk. It is not the
          location of a narrowing.
        </p>
      )}
    </div>
  );
}
