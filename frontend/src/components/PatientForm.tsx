import {
  Activity,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  FlaskConical,
  Heart,
  HeartCrack,
  RotateCcw,
  Search,
  Stethoscope,
  User,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { FeatureSchema, SamplePatient, Schema } from "../api/types";
import { cn } from "../lib/cn";
import { formatRange, outsideNormal, type FormErrors, type FormValues } from "../lib/form";
import { Accordion, AccordionItem, Button, InfoTip, Select } from "./primitives";
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

const inputCls =
  "h-11 w-full rounded-lg border bg-surface-2 px-3 font-manrope text-sm text-white outline-none transition-colors duration-150 placeholder:text-white/30 hover:border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/30";

function Field({ f, raw, error, onChange }: { f: FeatureSchema; raw: string; error?: string; onChange: (v: string) => void }) {
  const outside = outsideNormal(f, raw);
  const id = `f-${f.id}`;
  const help = `${f.description}${f.unit ? ` Unit: ${f.unit}.` : ""}${f.normal_range ? ` Typical adult range: ${formatRange(f.normal_range, f.unit)}.` : ""}`;
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
          className={cn(inputCls, "pr-16 tabular-nums", error ? "border-red-500/80" : outside ? "border-amber-400/50" : "border-white/10")}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
        />
        {f.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">{f.unit}</span>}
      </div>
    );
  } else if (f.type === "binary" && f.options?.length === 2) {
    control = (
      <div className="grid h-11 grid-cols-2 rounded-lg border border-white/10 bg-surface-2 p-1" role="radiogroup" aria-labelledby={`${id}-label`}>
        {f.options.map((o) => {
          const on = String(o.value) === raw;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(String(o.value))}
              className={cn("relative rounded-md font-manrope text-xs font-semibold transition-colors duration-150", on ? "text-white" : "text-white/50 hover:text-white/80")}
            >
              {on && (
                <motion.span layoutId={`seg-${f.id}`} className="absolute inset-0 rounded-md bg-primary shadow-md shadow-primary/30" transition={{ type: "spring", stiffness: 520, damping: 38 }} />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  } else {
    control = (
      <Select id={id} value={raw} onValueChange={onChange} invalid={Boolean(error)} options={(f.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))} />
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1">
          <label id={`${id}-label`} htmlFor={id} className="truncate font-manrope text-xs font-medium text-white/80">
            {f.label}
          </label>
          <InfoTip text={help} label={f.label} />
        </span>
        {outside && <RangeChip status={outside} />}
      </div>
      {control}
      <p id={`${id}-help`} className={cn("mt-1 min-h-4 text-[11px]", error ? "text-red-400" : "text-white/40")}>
        {error ?? (f.normal_range ? `Normal ${formatRange(f.normal_range, f.unit)}` : "")}
      </p>
    </div>
  );
}

function DerivedField({ f, derived }: { f: FeatureSchema; derived: Record<string, number> | null }) {
  const v = derived?.[f.id];
  const text = v === undefined ? "Calculating…" : f.type === "numeric" ? `${v.toFixed(1)}${f.unit ? ` ${f.unit}` : ""}` : (f.options?.find((o) => Number(o.value) === v)?.label ?? String(v));
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-h-5 items-center gap-1">
        <span className="font-manrope text-xs font-medium text-white/80">{f.label}</span>
        <InfoTip text={`${f.description} Calculated automatically from other inputs.`} label={f.label} />
      </div>
      <div className="flex h-11 items-center rounded-lg border border-dashed border-white/15 px-3 font-manrope text-sm tabular-nums text-white/80">{text}</div>
      <p className="mt-1 min-h-4 text-[11px] text-white/40">Calculated automatically</p>
    </div>
  );
}

export function PatientForm(p: Props) {
  const { schema, values, errors } = p;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>(schema.groups.slice(0, 2).map((g) => g.id));
  const nErrors = Object.keys(errors).length;
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      new Set(
        schema.features.filter((f) => !q || `${f.label} ${f.id} ${f.description} ${f.unit ?? ""}`.toLowerCase().includes(q)).map((f) => f.id),
      ),
    [schema, q],
  );
  const groupsWithMatches = schema.groups.filter((g) => schema.features.some((f) => f.group === g.id && matches.has(f.id))).map((g) => g.id);
  const errorGroups = schema.groups.filter((g) => schema.features.some((f) => f.group === g.id && errors[f.id])).map((g) => g.id);

  // searching opens every group with a match; invalid fields always open their group
  useEffect(() => {
    if (q) setOpen(groupsWithMatches);
  }, [q]);
  useEffect(() => {
    if (errorGroups.length) setOpen((o) => [...new Set([...o, ...errorGroups])]);
  }, [errorGroups.join()]);

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 no-scrollbar">
        <div>
          <h2 className="font-serif text-[28px] leading-tight text-white">Patient</h2>
          <p className="mt-0.5 text-xs text-white/50">Start from a real example or edit any value.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {p.samples.map((s) => {
              const Icon = SAMPLE_ICON[s.kind] ?? Heart;
              const on = p.activeSample?.kind === s.kind;
              return (
                <motion.button
                  key={s.kind}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => p.onLoadSample(s)}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center font-cabin text-[11px] leading-tight transition-colors duration-200",
                    on ? "border-primary/70 bg-primary/15 text-white" : "border-white/[0.08] bg-surface-2 text-white/70 hover:border-white/20 hover:text-white",
                  )}
                >
                  <Icon className={cn("h-5 w-5", on ? "text-brand-300" : "text-white/50")} aria-hidden />
                  {s.title.replace(" disease", "")}
                </motion.button>
              );
            })}
          </div>
          {p.activeSample && (
            <motion.p
              key={p.activeSample.kind}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 rounded-lg border border-white/[0.07] bg-surface-2 p-2.5 text-[11px] leading-relaxed text-white/60"
            >
              <span className="font-semibold text-white/90">Example #{p.activeSample.patient_id}:</span> {p.activeSample.description}{" "}
              <span className="italic">Real training-set record, so its prediction is in-sample.</span>
            </motion.p>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search measurements, e.g. LDL or ejection"
            aria-label="Search measurements"
            className={cn(inputCls, "border-white/10 pl-9 pr-10")}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-white/50 hover:text-white">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        {q && matches.size === 0 && <p className="px-1 text-xs text-white/50">No measurement matches “{query}”.</p>}

        <Accordion type="multiple" value={open} onValueChange={setOpen} className="space-y-2.5">
          {schema.groups.map((g) => {
            const feats = schema.features.filter((f) => f.group === g.id && matches.has(f.id));
            if (!feats.length) return null;
            const Icon = GROUP_ICON[g.id] ?? Activity;
            const flagged = feats.filter((f) => f.input && outsideNormal(f, values[f.id] ?? "")).length;
            const groupErrors = feats.filter((f) => errors[f.id]).length;
            return (
              <AccordionItem
                key={g.id}
                value={g.id}
                header={
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-brand-300">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="truncate font-manrope text-sm font-semibold text-white">{g.label}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-[11px]">
                      {groupErrors > 0 && <span className="text-red-400">{groupErrors} to fix</span>}
                      {flagged > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-amber-300">
                          <CircleAlert className="h-3 w-3" aria-hidden /> {flagged}
                        </span>
                      )}
                      <span className="text-white/35">{feats.length}</span>
                    </span>
                  </span>
                }
              >
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {feats.map((f) =>
                    f.input ? (
                      <Field key={f.id} f={f} raw={values[f.id] ?? ""} error={errors[f.id]} onChange={(v) => p.onChange(f.id, v)} />
                    ) : (
                      <DerivedField key={f.id} f={f} derived={p.derived} />
                    ),
                  )}
                </div>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>

      <div className="border-t border-white/[0.07] bg-surface/90 p-4 backdrop-blur-xl">
        <div className="flex gap-2">
          {p.live ? (
            <div className="flex h-11 flex-1 items-center gap-2.5 rounded-lg border border-white/[0.08] bg-surface-2 px-3 text-xs text-white/70">
              <span className="relative flex h-2.5 w-2.5">
                {(p.busy || p.dirty) && !nErrors && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
                <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", nErrors ? "bg-red-500" : p.busy || p.dirty ? "bg-primary" : "bg-emerald-500")} />
              </span>
              <span aria-live="polite">
                {nErrors > 0
                  ? nErrors === 1
                    ? "1 field needs attention"
                    : `${nErrors} fields need attention`
                  : p.busy || p.dirty
                    ? "Updating…"
                    : `Up to date${p.latencyMs !== null ? ` · ${p.latencyMs} ms` : ""}`}
              </span>
            </div>
          ) : (
            <Button type="submit" variant="primary" disabled={p.busy || nErrors > 0} className="flex-1">
              {p.busy ? "Predicting…" : "Run prediction"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={p.onReset} aria-label="Reset to typical values">
            <RotateCcw className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
