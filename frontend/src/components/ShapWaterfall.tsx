import { ArrowDown, ArrowUp } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TargetExplanation } from "../api/types";
import { buildWaterfall, formatPct, formatTickPct, probabilityTicks, sigmoid, waterfallDomain, type WaterfallRow } from "../lib/waterfall";

/** Diverging pair (validated on the dark panel surface: CVD ΔE 21.6, contrast ≥ 3:1). */
export const RAISES = "#e34948";
export const LOWERS = "#2a78d6";

const ROW_H = 30;

function YTick({ x, y, payload, rows }: { x?: number; y?: number; payload?: { value: string }; rows: WaterfallRow[] }) {
  const row = rows.find((r) => r.key === payload?.value);
  if (!row) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={-2} textAnchor="end" fill="#e2e8f0" fontSize={11}>
        {row.label.length > 30 ? row.label.slice(0, 29) + "…" : row.label}
      </text>
      <text x={-8} y={10} textAnchor="end" fill="#94a3b8" fontSize={10}>
        {row.shap >= 0 ? "▲" : "▼"} {row.valueText}
      </text>
    </g>
  );
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: WaterfallRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const up = r.shap >= 0;
  return (
    <div className="max-w-64 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-300 shadow-xl">
      <div className="font-semibold text-white">{r.label}</div>
      <div className="text-slate-400">Value: {r.valueText}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: up ? RAISES : LOWERS }} />
        {up ? "Raises" : "Lowers"} predicted risk: {formatPct(r.pBefore)} → {formatPct(r.pAfter)}
      </div>
      <div className="text-[11px] text-slate-500">
        {up ? "+" : "−"}
        {Math.abs(r.shap).toFixed(2)} log-odds
      </div>
    </div>
  );
}

export function ShapWaterfall({ explanation, topN = 10 }: { explanation: TargetExplanation; topN?: number }) {
  const rows = buildWaterfall(explanation, topN);
  const domain = waterfallDomain(explanation, rows);
  const ticks = probabilityTicks(domain);
  const height = rows.length * ROW_H + 56;

  return (
    <div>
      <p className="mb-2 text-xs leading-relaxed text-slate-400">
        From an average patient (<span className="font-semibold text-slate-200">{formatPct(explanation.base_probability)}</span>) to this
        patient (<span className="font-semibold text-slate-200">{formatPct(explanation.probability)}</span>): each bar is one factor's
        push, largest first.
      </p>
      <div style={{ height }} role="img" aria-label={`SHAP waterfall for ${explanation.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 22, right: 16, bottom: 4, left: 8 }} barCategoryGap={4}>
            <XAxis
              type="number"
              domain={domain}
              ticks={ticks}
              tickFormatter={(z: number) => formatTickPct(sigmoid(z))}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              stroke="#334155"
              tickLine={false}
              orientation="top"
            />
            <YAxis type="category" dataKey="key" width={176} tickLine={false} axisLine={false} tick={<YTick rows={rows} />} interval={0} />
            <Tooltip content={<TooltipBody />} cursor={{ fill: "rgba(148,163,184,0.08)" }} isAnimationActive={false} />
            <ReferenceLine x={explanation.base_value} stroke="#64748b" strokeDasharray="3 3" />
            <ReferenceLine x={explanation.log_odds} stroke="#e2e8f0" strokeWidth={1.5} />
            <Bar dataKey="range" radius={4} isAnimationActive={false} minPointSize={2}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.shap >= 0 ? RAISES : LOWERS} fillOpacity={r.isOther ? 0.55 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RAISES }} />
          <ArrowUp className="-ml-1 h-3 w-3" aria-hidden /> raises risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOWERS }} />
          <ArrowDown className="-ml-1 h-3 w-3" aria-hidden /> lowers risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 border-l border-dashed border-slate-500" /> average patient
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 border-l-2 border-slate-200" /> this patient
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        SHAP values add up exactly in log-odds; the axis shows the matching probability. Associations learned from data, not causes.
      </p>
    </div>
  );
}
