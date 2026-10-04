import {
  Activity,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  FlaskConical,
  Heart,
  HeartCrack,
  Search,
  Stethoscope,
  User,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
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

const GROUP_ICON: Record<string, LucideIcon> = {
  demographic: User,
  history: ClipboardList,
  exam: Stethoscope,
  ecg: Activity,
  lab: FlaskConical,
  echo: Waves,
};
const SAMPLE_ICON: Record<string, LucideIcon> = { normal: CircleCheck, single_vessel: Heart, multi_vessel: HeartCrack };

const fieldCls =
  "h-10 w-full rounded-lg border bg-white/[0.04] px-3 font-manrope text-sm text-white outline-none transition-colors duration-150 placeholder:text-white/30 hover:border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/30";

function Field({ f, raw, error, onChange }: { f: FeatureSchema; raw: string; error?: string; onChange: (v: string) => void }) {
  const outside = outsideNormal(f, raw);
  const border = error ? "border-red-500/80" : outside ? "border-amber-400/50" : "border-white/10";
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
          className={`${fieldCls} ${border} pr-16 tabular-nums`}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
        />
        {f.unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">{f.unit}</span>
        )}
      </div>
    );
  } else if (f.type === "binary" && f.options?.length === 2) {
    control = (
      <div className="relative grid h-10 grid-cols-2 rounded-lg border border-white/10 bg-white/[0.04] p-1" role="radiogroup" aria-labelledby={`${id}-label`}>
        {f.options.map((o) => {
          const on = String(o.value) === raw;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(String(o.value))}
              className={`relative rounded-md font-manrope text-xs font-semibold transition-colors duration-150 ${on ? "text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {on && (
                <motion.span
                  layoutId={`seg-${f.id}`}
                  className="absolute inset-0 rounded-md bg-primary shadow-md shadow-primary/30"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  } else {
    control = (
      <div className="relative">
        <select id={id} value={raw} onChange={(e) => onChange(e.target.value)} className={`${fieldCls} ${border} appearance-none pr-9`}>
          {f.options?.map((o) => (
            <option key={String(o.value)} value={String(o.value)} className="bg-[#1a1530]">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label id={`${id}-label`} htmlFor={id} title={f.description} className="font-manrope text-xs font-medium text-white/80">
          {f.label}
        </label>
        {outside && <RangeChip status={outside} />}
      </div>
      {control}
      <p id={`${id}-help`} className={`mt-1 text-[11px] ${error ? "text-red-400" : "text-white/40"}`}>
        {error ?? (f.normal_range ? `Normal ${formatRange(f.normal_range, f.unit)}` : " ")}
      </p>
    </div>
  );
}

function DerivedField({ f, derived }: { f: FeatureSchema; derived: Record<string, number> | null }) {
  const v = derived?.[f.id];
  const text =
    v === undefined
      ? "—"
      : f.type === "numeric"
        ? `${v.toFixed(1)}${f.unit ? ` ${f.unit}` : ""}`
        : (f.options?.find((o) => Number(o.value) === v)?.label ?? String(v));
  return (
    <div title={f.description}>
      <div className="mb-1.5 font-manrope text-xs font-medium text-white/80">{f.label}</div>
      <div className="flex h-10 items-center rounded-lg border border-dashed border-white/15 px-3 font-manrope text-sm text-white/80">{text}</div>
      <p className="mt-1 text-[11px] text-white/40">Computed from other inputs</p>
    </div>
  );
}

export function PatientForm(p: Props) {
  const { schema, values, errors } = p;
  const [query, setQuery] = useState("");
  const nErrors = Object.keys(errors).length;
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      new Set(
        schema.features
          .filter((f) => !q || `${f.label} ${f.id} ${f.description} ${f.unit ?? ""}`.toLowerCase().includes(q))
          .map((f) => f.id),
      ),
    [schema, q],
  );

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-serif text-2xl text-white">Patient data</h2>
          <p className="mt-0.5 text-xs text-white/50">Start from a real example or edit any value. Results update as you type.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {p.samples.map((s) => {
              const Icon = SAMPLE_ICON[s.kind] ?? Heart;
              const on = p.activeSample?.kind === s.kind;
              return (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => p.onLoadSample(s)}
                  title={s.description}
                  aria-pressed={on}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center font-cabin text-[11px] leading-tight transition-colors duration-200 ${
                    on ? "border-primary/70 bg-primary/15 text-white" : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${on ? "text-brand-300" : "text-white/50"}`} aria-hidden />
                  {s.title.replace(" disease", "")}
                </button>
              );
            })}
          </div>
          {p.activeSample && (
            <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-white/60">
              <span className="font-semibold text-white/90">Example #{p.activeSample.patient_id}:</span> {p.activeSample.description}{" "}
              <span className="italic">Real training-set record, so its prediction is in-sample.</span>
            </p>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a measurement (e.g. LDL, ejection)"
            aria-label="Find a measurement"
            className={`${fieldCls} border-white/10 pl-9 pr-9`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-white/50 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        {q && matches.size === 0 && <p className="text-xs text-white/50">No measurement matches “{query}”.</p>}

        {schema.groups.map((g, gi) => {
          const feats = schema.features.filter((f) => f.group === g.id && matches.has(f.id));
          if (!feats.length) return null;
          const Icon = GROUP_ICON[g.id] ?? Activity;
          const flagged = feats.filter((f) => f.input && outsideNormal(f, values[f.id] ?? "")).length;
          const groupErrors = feats.filter((f) => errors[f.id]).length;
          return (
            <details key={g.id} open={Boolean(q) || gi < 2 || groupErrors > 0} className="glass group rounded-xl">
              <summary className="flex min-h-12 list-none items-center justify-between gap-2 px-3.5 py-2">
                <span className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-brand-300">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="font-manrope text-sm font-semibold text-white">{g.label}</span>
                  <span className="text-[11px] text-white/40">{feats.length}</span>
                </span>
                <span className="flex items-center gap-2 text-[11px]">
                  {groupErrors > 0 && <span className="text-red-400">{groupErrors} to fix</span>}
                  {flagged > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <CircleAlert className="h-3.5 w-3.5" aria-hidden /> {flagged}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-white/40 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">
                {feats.map((f) =>
                  f.input ? (
                    <Field key={f.id} f={f} raw={values[f.id] ?? ""} error={errors[f.id]} onChange={(v) => p.onChange(f.id, v)} />
                  ) : (
                    <DerivedField key={f.id} f={f} derived={p.derived} />
                  ),
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-auto border-t border-white/10 bg-ink/80 p-4 backdrop-blur-xl">
        <div className="flex gap-2">
          {p.live ? (
            <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70">
              <span className="relative flex h-2.5 w-2.5">
                {(p.busy || p.dirty) && !nErrors && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${nErrors ? "bg-red-500" : p.busy || p.dirty ? "bg-primary" : "bg-emerald-500"}`} />
              </span>
              Live: results follow your edits
            </div>
          ) : (
            <button
              type="submit"
              disabled={p.busy || nErrors > 0}
              className="flex-1 rounded-lg bg-primary px-3 py-2.5 font-cabin text-sm font-medium text-white shadow-lg shadow-primary/30 transition-colors duration-200 hover:bg-primary-hover disabled:opacity-50"
            >
              {p.busy ? "Predicting…" : "Predict"}
            </button>
          )}
          <button
            type="button"
            onClick={p.onReset}
            className="min-h-11 rounded-lg border border-white/15 px-4 font-cabin text-sm text-white/80 transition-colors duration-200 hover:border-white/30 hover:text-white"
          >
            Reset
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/50" aria-live="polite">
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
