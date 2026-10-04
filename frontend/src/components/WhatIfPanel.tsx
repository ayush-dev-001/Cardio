import type { FeatureSchema, Schema } from "../api/types";
import type { FormValues } from "../lib/form";
import { Panel } from "./ui";

interface Props {
  schema: Schema;
  values: FormValues;
  baseline: FormValues | null;
  onChange: (id: string, raw: string) => void;
  onResetToBaseline: () => void;
  onSetBaseline: () => void;
}

/** Slider step that gives ~100 positions over the observed range, rounded to a tidy value. */
function niceStep([lo, hi]: [number, number]): number {
  const raw = (hi - lo) / 100;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

function SliderRow({ f, raw, base, onChange }: { f: FeatureSchema; raw: string; base: string | undefined; onChange: (v: string) => void }) {
  const range = f.observed_range ?? f.valid_range ?? [0, 100];
  const step = niceStep(range);
  const v = Number(raw);
  const changed = base !== undefined && base !== raw;
  const basePos = base !== undefined ? ((Number(base) - range[0]) / (range[1] - range[0])) * 100 : null;
  return (
    <label className="block">
      <div className="mb-0.5 flex items-baseline justify-between text-xs">
        <span className="text-slate-300">{f.label}</span>
        <span className="tabular-nums">
          <span className={changed ? "font-semibold text-brand-300" : "text-white"}>
            {Number.isFinite(v) ? v : "–"}
          </span>
          <span className="text-slate-500"> {f.unit}</span>
          {changed && <span className="text-slate-500"> (was {base})</span>}
        </span>
      </div>
      <div className="relative">
        {basePos !== null && changed && (
          <span
            className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-slate-400"
            style={{ left: `${Math.min(100, Math.max(0, basePos))}%` }}
            title="baseline"
          />
        )}
        <input
          type="range"
          min={range[0]}
          max={range[1]}
          step={step}
          value={Number.isFinite(v) ? Math.min(range[1], Math.max(range[0], v)) : range[0]}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`What-if: ${f.label}`}
          className="w-full"
        />
      </div>
    </label>
  );
}

function ToggleRow({ f, raw, base, onChange }: { f: FeatureSchema; raw: string; base: string | undefined; onChange: (v: string) => void }) {
  const changed = base !== undefined && base !== raw;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className={changed ? "font-semibold text-brand-300" : "text-white/80"}>{f.label}</span>
      <div className="inline-flex rounded-md border border-white/10 bg-white/[0.04] p-0.5" role="radiogroup" aria-label={`What-if: ${f.label}`}>
        {f.options?.map((o) => {
          const on = String(o.value) === raw;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(String(o.value))}
              className={`rounded px-2 py-0.5 ${on ? "bg-primary text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Modifiable risk factors (features.yaml `what_if: true`) as sliders/toggles; changes update live. */
export function WhatIfPanel({ schema, values, baseline, onChange, onResetToBaseline, onSetBaseline }: Props) {
  const feats = schema.features.filter((f) => f.what_if && f.input);
  const numeric = feats.filter((f) => f.type === "numeric");
  const toggles = feats.filter((f) => f.type !== "numeric");
  const nChanged = baseline ? feats.filter((f) => baseline[f.id] !== values[f.id]).length : 0;

  return (
    <Panel
      title="What-if: modifiable risk factors"
      right={
        <div className="flex gap-1.5 text-[11px]">
          <button
            onClick={onResetToBaseline}
            disabled={!nChanged}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-slate-500 disabled:opacity-40"
          >
            Reset{nChanged ? ` (${nChanged})` : ""}
          </button>
          <button onClick={onSetBaseline} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-slate-500">
            Set as baseline
          </button>
        </div>
      }
    >
      <div className="space-y-2.5">
        {numeric.map((f) => (
          <SliderRow key={f.id} f={f} raw={values[f.id] ?? ""} base={baseline?.[f.id]} onChange={(v) => onChange(f.id, v)} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
        {toggles.map((f) => (
          <ToggleRow key={f.id} f={f} raw={values[f.id] ?? ""} base={baseline?.[f.id]} onChange={(v) => onChange(f.id, v)} />
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Explores how the model's output responds; it does not predict the effect of treating a risk factor. Slider limits =
        range seen in the training data.
      </p>
    </Panel>
  );
}
