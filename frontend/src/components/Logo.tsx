import { Activity } from "lucide-react";

/** CardioScope wordmark: ECG glyph in a dark tile + name (name hidden on very small screens). */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 ring-1 ring-slate-700">
        <Activity className="h-4.5 w-4.5 text-cta" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="text-base font-bold tracking-tight text-white max-[360px]:sr-only">CardioScope</span>
    </span>
  );
}
