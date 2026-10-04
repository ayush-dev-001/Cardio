import { ChevronDown, CircleAlert } from "lucide-react";
import type { FeatureSchema, SamplePatient, Schema } from "../api/types";
import { formatRange, outsideNormal, type FormErrors, type FormValues } from "../lib/form";
import { RangeChip } from "./ui";

interface Props {
  schema: Schema;
  values: FormValues;
  errors: FormErrors;
  derived: Record<string, number> | null;
  samples: SamplePatient[];
  activeSample: SamplePatient | null;
  busy: boolean;
  dirty: boolean;
  live: boolean;
  latencyMs: number | null;
  onChange: (id: string, raw: string) => void;
  onLoadSample: (s: SamplePatient) => void;
  onReset: () => void;
  onSubmit: () => void;
}

const inputCls =
  "w-full rounded-md border bg-slate-950/70 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/40";

function Field({ f, raw, error, onChange }: { f: FeatureSchema; raw: string; error?: string; onChange: (v: string) => void }) {
  const outside = outsideNormal(f, raw);
  const border = error ? "border-red-500" : outside ? "border-amber-500/60" : "border-slate-700";
  const id = `f-${f.id}`;
  let control;
  if (f.type === "numeric") {
    control = (
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          min={f.valid_range?.[0]}
          max={f.valid_range?.[1]}
          value={raw}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} ${border} pr-16`}
          aria-invalid={Boolean(error)}
        />
        {f.unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{f.unit}</span>}
      </div>
    );
  } else if (f.type === "binary" && f.options?.length === 2) {
    control = (
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-labelledby={`${id}-label`}>
        {f.options.map((o) => {
          const on = String(o.value) === raw;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(String(o.value))}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                on ? "border-sky-400 bg-sky-500/15 text-sky-100" : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  } else {
    control = (
      <select id={id} value={raw} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${border}`}>
        {f.options?.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label id={`${id}-label`} htmlFor={id} title={f.description} className="cursor-help text-xs text-slate-300">
          {f.label}
        </label>
        {outside && <RangeChip status={outside} />}
      </div>
      {control}
      {error ? (
        <p className="mt-0.5 text-[11px] text-red-400">{error}</p>
      ) : (
        f.normal_range && <p className="mt-0.5 text-[11px] text-slate-500">Normal {formatRange(f.normal_range, f.unit)}</p>
      )}
    </div>
  );
}

export function PatientForm(p: Props) {
  const { schema, values, errors } = p;
  const nErrors = Object.keys(errors).length;
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <div className="space-y-3 p-3">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-100">Patient data</h2>
          <div className="flex flex-wrap gap-1.5">
            {p.samples.map((s) => (
              <button
                key={s.kind}
                type="button"
                onClick={() => p.onLoadSample(s)}
                title={s.description}
                className={`rounded-md border px-2 py-1 text-xs ${
                  p.activeSample?.kind === s.kind ? "border-sky-400 text-sky-100" : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
          {p.activeSample && (
            <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/60 p-2 text-[11px] leading-relaxed text-slate-400">
              <span className="font-medium text-slate-200">Example patient #{p.activeSample.patient_id}:</span>{" "}
              {p.activeSample.description} <span className="italic">Real record from the training data, so its prediction is in-sample.</span>
            </p>
          )}
        </div>

        {schema.groups.map((g, gi) => {
          const feats = schema.features.filter((f) => f.group === g.id);
          if (!feats.length) return null;
          const flagged = feats.filter((f) => f.input && outsideNormal(f, values[f.id] ?? "")).length;
          const groupErrors = feats.filter((f) => errors[f.id]).length;
          return (
            <details key={g.id} open={gi < 2 || groupErrors > 0} className="group rounded-lg border border-slate-800 bg-slate-900/50">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200">
                <span>{g.label}</span>
                <span className="flex items-center gap-2 font-normal">
                  {groupErrors > 0 && <span className="text-red-400">{groupErrors} to fix</span>}
                  {flagged > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <CircleAlert className="h-3.5 w-3.5" aria-hidden /> {flagged} outside normal
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-3 pb-3">
                {feats.map((f) =>
                  f.input ? (
                    <Field key={f.id} f={f} raw={values[f.id] ?? ""} error={errors[f.id]} onChange={(v) => p.onChange(f.id, v)} />
                  ) : (
                    <div key={f.id} title={f.description}>
                      <div className="mb-1 text-xs text-slate-300">{f.label}</div>
                      <div className="rounded-md border border-dashed border-slate-700 px-2 py-1 text-sm text-slate-300">
                        {p.derived?.[f.id] !== undefined
                          ? f.type === "numeric"
                            ? `${p.derived[f.id].toFixed(1)}${f.unit ? ` ${f.unit}` : ""}`
                            : (f.options?.find((o) => Number(o.value) === p.derived![f.id])?.label ?? String(p.derived[f.id]))
                          : "—"}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">Computed from other inputs</p>
                    </div>
                  ),
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-auto border-t border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
        <div className="flex gap-2">
          {p.live ? (
            <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-xs text-slate-300">
              <span className={`h-2 w-2 rounded-full ${nErrors ? "bg-red-500" : p.busy || p.dirty ? "animate-pulse bg-amber-400" : "bg-emerald-500"}`} />
              Live: results follow your edits
            </div>
          ) : (
            <button
              type="submit"
              disabled={p.busy || nErrors > 0}
              className="flex-1 rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p.busy ? "Predicting…" : "Predict"}
            </button>
          )}
          <button type="button" onClick={p.onReset} className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500">
            Reset
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500" aria-live="polite">
          {nErrors > 0
            ? nErrors === 1
              ? "1 field needs attention"
              : `${nErrors} fields need attention`
            : p.busy || (p.live && p.dirty)
              ? "Updating…"
              : p.dirty
                ? "Inputs changed since the last prediction"
                : `Results are up to date${p.latencyMs !== null ? ` · last update ${p.latencyMs} ms` : ""}`}
        </p>
      </div>
    </form>
  );
}
