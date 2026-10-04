/** Small shared UI primitives (dark theme). Status is always icon + label, never colour alone. */
import { ArrowDown, ArrowUp, Check, CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RangeStatus, RiskLevel } from "../api/types";

export function Panel({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const RISK_CHIP: Record<RiskLevel, { icon: LucideIcon; cls: string; text: string }> = {
  low: { icon: CircleCheck, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", text: "Low" },
  moderate: { icon: CircleAlert, cls: "border-amber-500/40 bg-amber-500/10 text-amber-200", text: "Moderate" },
  high: { icon: TriangleAlert, cls: "border-red-500/40 bg-red-500/10 text-red-300", text: "High" },
};

export function RiskChip({ level, suffix = "" }: { level: RiskLevel; suffix?: string }) {
  const c = RISK_CHIP[level];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      <c.icon className="h-3.5 w-3.5" aria-hidden />
      {c.text}
      {suffix}
    </span>
  );
}

const RANGE_CHIP: Record<Exclude<RangeStatus, null>, { icon: LucideIcon; cls: string; text: string }> = {
  low: { icon: ArrowDown, cls: "text-sky-300", text: "Low" },
  normal: { icon: Check, cls: "text-slate-400", text: "Normal" },
  high: { icon: ArrowUp, cls: "text-amber-300", text: "High" },
};

export function RangeChip({ status }: { status: RangeStatus }) {
  if (!status) return null;
  const c = RANGE_CHIP[status];
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-medium ${c.cls}`}>
      <c.icon className="h-3 w-3" aria-hidden />
      {c.text}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5 text-xs">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            value === it.id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export const MODEL_NAMES: Record<string, string> = {
  logreg: "Logistic regression",
  random_forest: "Random forest",
  xgboost: "XGBoost",
  catboost: "CatBoost",
};
