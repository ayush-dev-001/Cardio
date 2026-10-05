import { RotateCcw, Pin } from "lucide-react";
import type { FeatureSchema, Schema } from "../api/types";
import { cn } from "../lib/cn";
import type { FormValues } from "../lib/form";
import { Button, Slider } from "./primitives";

interface Props {
  schema: Schema;
  values: FormValues;
  baseline: FormValues | null;
  onChange: (id: string, raw: string) => void;
  onResetToBaseline: () => void;
  onSetBaseline: () => void;
}

/** Slider step giving ~100 positions over the observed range, rounded to a tidy value. */
function niceStep([lo, hi]: [number, number]): number {
  const raw = (hi - lo) / 100;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}
const decimalsOf = (step: number) => Math.max(0, -Math.floor(Math.log10(step)));

function SliderRow({ f, raw, base, onChange }: { f: FeatureSchema; raw: string; base: string | undefined; onChange: (v: string) => void }) {
  const range = f.observed_range ?? f.valid_range ?? [0, 100];
  const step = niceStep(range);
  const dp = decimalsOf(step);
  const v = Number(raw);
  const changed = base !== undefined && base !== raw;
  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(dp) : "–");
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn("font-manrope font-medium", changed ? "text-brand-300" : "text-white/80")}>{f.label}</span>
        <span className="tabular-nums">
          <span className={cn("font-manrope font-semibold", changed ? "text-brand-300" : "text-white")}>{fmt(v)}</span>
          <span className="text-white/40"> {f.unit}</span>
          {changed && <span className="text-white/40"> · was {fmt(Number(base))}</span>}
        </span>
      </div>
      <Slider
        value={Number.isFinite(v) ? v : range[0]}
        min={range[0]}
        max={range[1]}
        step={step}
        label={`What-if: ${f.label}`}
        marker={changed && base !== undefined ? Number(base) : null}
        onValueChange={(x) => onChange(x.toFixed(dp))}
      />
    </div>
  );
}

function ToggleRow({ f, raw, base, onChange }: { f: FeatureSchema; raw: string; base: string | undefined; onChange: (v: string) => void }) {
  const changed = base !== undefined && base !== raw;
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 text-xs">
      <span className={cn("font-manrope font-medium", changed ? "text-brand-300" : "text-white/80")}>{f.label}</span>
      <div className="inline-flex rounded-lg border border-white/10 bg-surface-2 p-1" role="radiogroup" aria-label={`What-if: ${f.label}`}>
        {f.options?.map((o) => {
          const on = String(o.value) === raw;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(String(o.value))}
              className={cn("min-h-8 rounded-md px-3 font-manrope font-semibold transition-colors", on ? "bg-primary text-white" : "text-white/50 hover:text-white/80")}
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
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/55">Move a risk factor and watch every probability and the heart update.</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onResetToBaseline} disabled={!nChanged}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset{nChanged ? ` (${nChanged})` : ""}
          </Button>
          <Button size="sm" variant="outline" onClick={onSetBaseline}>
            <Pin className="h-3.5 w-3.5" aria-hidden /> Set baseline
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {numeric.map((f) => (
          <SliderRow key={f.id} f={f} raw={values[f.id] ?? ""} base={baseline?.[f.id]} onChange={(v) => onChange(f.id, v)} />
        ))}
      </div>
      <div className="mt-4 space-y-1 border-t border-white/[0.07] pt-3">
        {toggles.map((f) => (
          <ToggleRow key={f.id} f={f} raw={values[f.id] ?? ""} base={baseline?.[f.id]} onChange={(v) => onChange(f.id, v)} />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/45">
        Shows how the model's output responds; it does not predict the effect of treating a risk factor. Slider limits are the
        range seen in the training data.
      </p>
    </div>
  );
}
