import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { VESSELS } from "../anatomy/anatomy";
import { riskColor } from "../anatomy/riskColor";

/** Mock probability presets for Phase 3 (replaced by real /predict output in Phase 6). */
export const MOCK_PRESETS: Record<string, { label: string; values: Record<string, number> }> = {
  normal: { label: "Normal", values: { LAD: 0.08, LCX: 0.12, RCA: 0.1 } },
  single: { label: "Single-vessel (LAD)", values: { LAD: 0.86, LCX: 0.22, RCA: 0.18 } },
  multi: { label: "Multi-vessel", values: { LAD: 0.91, LCX: 0.74, RCA: 0.82 } },
};

interface Props {
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}

const btn = "rounded-md border border-slate-600 px-2 py-1 text-xs hover:border-sky-400 hover:text-white";

export function MockPanel({ values, onChange }: Props) {
  // collapsed by default on phones so the 3D view stays visible
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const randomize = () => onChange(Object.fromEntries(VESSELS.map((v) => [v.id, Math.round(Math.random() * 100) / 100])));

  return (
    <div className="w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-700 bg-slate-900/90 p-4 text-sm text-slate-300 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between font-semibold text-white"
      >
        Mock probabilities
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <>
          <p className="mb-3 mt-1 text-xs text-slate-500">Demo data until the model API is connected.</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Object.entries(MOCK_PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => onChange({ ...p.values })} className={btn}>
                {p.label}
              </button>
            ))}
            <button onClick={randomize} className={btn}>
              Random
            </button>
          </div>
          {VESSELS.map((v) => {
            const p = values[v.id] ?? 0;
            return (
              <label key={v.id} className="mb-2 block">
                <div className="flex justify-between text-xs">
                  <span>{v.id}</span>
                  <span className="font-semibold" style={{ color: riskColor(p) }}>
                    {Math.round(p * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={p}
                  aria-label={`${v.id} probability`}
                  onChange={(e) => onChange({ ...values, [v.id]: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
            );
          })}
        </>
      )}
    </div>
  );
}
