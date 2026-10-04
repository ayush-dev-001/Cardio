import { useMemo, useState } from "react";
import type { Contribution, Schema, TargetExplanation } from "../api/types";
import { formatRange } from "../lib/form";
import { rangeBar } from "../lib/physiology";
import { LOWERS, RAISES } from "./ShapWaterfall";
import { RangeChip, Tabs } from "./ui";

type SortMode = "impact" | "group";

function RangeViz({ c, valid }: { c: Contribution; valid: [number, number] | null }) {
  if (!c.normal_range || typeof c.value !== "number") return null;
  const b = rangeBar(c.normal_range, c.value, valid);
  const markerColor = c.status === "normal" ? "#cbd5e1" : c.status === "high" ? "#fcd34d" : "#7dd3fc";
  return (
    <div className="relative mt-1.5 h-1.5 rounded-full bg-white/10" title={`Normal ${formatRange(c.normal_range, c.unit)}`}>
      <div
        className="absolute inset-y-0 rounded-full bg-slate-500/70"
        style={{ left: `${b.normalFrom * 100}%`, width: `${(b.normalTo - b.normalFrom) * 100}%` }}
      />
      <div
        className="absolute -top-[3px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-slate-950"
        style={{ left: `${b.markerAt * 100}%`, background: markerColor }}
      />
    </div>
  );
}

/** Centered diverging bar for one SHAP contribution, scaled to the largest in the list. */
function ContributionBar({ shap, max }: { shap: number; max: number }) {
  const w = max > 0 ? (Math.abs(shap) / max) * 50 : 0;
  return (
    <div className="relative h-2 w-full" aria-hidden>
      <div className="absolute inset-y-[-2px] left-1/2 w-px bg-slate-600" />
      <div
        className="absolute inset-y-0 rounded-sm"
        style={{ background: shap >= 0 ? RAISES : LOWERS, width: `${w}%`, left: shap >= 0 ? "50%" : `${50 - w}%` }}
      />
    </div>
  );
}

export function PhysiologyPanel({ schema, explanation }: { schema: Schema; explanation: TargetExplanation }) {
  const [sort, setSort] = useState<SortMode>("impact");
  const [showAll, setShowAll] = useState(false);
  const specs = useMemo(() => Object.fromEntries(schema.features.map((f) => [f.id, f])), [schema]);
  const max = Math.max(...explanation.contributions.map((c) => Math.abs(c.shap)));

  const rows = useMemo(() => {
    const cs = [...explanation.contributions];
    if (sort === "impact") return cs.sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
    const order = Object.fromEntries(schema.groups.map((g, i) => [g.id, i]));
    const pos = Object.fromEntries(schema.features.map((f, i) => [f.id, i]));
    return cs.sort((a, b) => order[a.group] - order[b.group] || pos[a.feature] - pos[b.feature]);
  }, [explanation, sort, schema]);
  const visible = showAll ? rows : rows.slice(0, 14);
  const outside = explanation.contributions.filter((c) => c.status === "low" || c.status === "high").length;
  const groupLabel = Object.fromEntries(schema.groups.map((g) => [g.id, g.label]));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {outside} measurement{outside === 1 ? "" : "s"} outside the normal range · contribution to{" "}
          <span className="text-slate-200">{explanation.label}</span>
        </p>
        <Tabs<SortMode> value={sort} onChange={setSort} items={[{ id: "impact", label: "By impact" }, { id: "group", label: "By group" }]} />
      </div>
      <div className="mb-1 grid grid-cols-[1fr_88px] gap-3 px-1 text-[10px] uppercase tracking-wide text-slate-500">
        <span>Measurement · value vs normal range</span>
        <span className="text-center">Contribution</span>
      </div>
      <ul className="divide-y divide-slate-800/80">
        {visible.map((c, i) => {
          const showGroup = sort === "group" && (i === 0 || visible[i - 1].group !== c.group);
          return (
            <li key={c.feature} className="px-1 py-1.5">
              {showGroup && <div className="mb-1 mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{groupLabel[c.group]}</div>}
              <div className="grid grid-cols-[1fr_88px] items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-slate-300" title={specs[c.feature]?.description}>
                      {c.label}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="text-xs font-medium tabular-nums text-white">{c.display_value}</span>
                      <RangeChip status={c.status} />
                    </span>
                  </div>
                  <RangeViz c={c} valid={specs[c.feature]?.valid_range ?? null} />
                </div>
                <div title={`${c.shap >= 0 ? "+" : "−"}${Math.abs(c.shap).toFixed(2)} log-odds`}>
                  <ContributionBar shap={c.shap} max={max} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > 14 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 min-h-9 text-xs font-medium text-brand-300 hover:text-white">
          {showAll ? "Show fewer" : `Show all ${rows.length} features`}
        </button>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Grey band = typical adult normal range; dot = this patient. Contribution: red pushes towards disease, blue away
        (same scale as the waterfall).
      </p>
    </div>
  );
}
