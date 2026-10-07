import { ArrowDown, ArrowUp, CircleAlert, Gauge, HeartPulse, MessageSquareText, Waypoints } from "lucide-react";
import type { ReactNode } from "react";
import type { ExplainResponse, PredictResponse, Schema } from "../api/types";
import { buildSummary, type SummaryLine } from "../lib/summary";
import { Card, CardHeader } from "./primitives";

const ICONS: Record<SummaryLine["kind"], ReactNode> = {
  overall: <HeartPulse className="h-3.5 w-3.5 text-white/70" aria-hidden />,
  up: <ArrowUp className="h-3.5 w-3.5 text-red-300" aria-hidden />,
  down: <ArrowDown className="h-3.5 w-3.5 text-sky-300" aria-hidden />,
  range: <CircleAlert className="h-3.5 w-3.5 text-amber-300" aria-hidden />,
  vessel: <Waypoints className="h-3.5 w-3.5 text-white/70" aria-hidden />,
  reliability: <Gauge className="h-3.5 w-3.5 text-white/50" aria-hidden />,
};

/** Plain-language summary of the current prediction (for patients, students and non-specialists). */
export function SummaryCard({ prediction, explanation, schema }: { prediction: PredictResponse; explanation: ExplainResponse | null; schema: Schema }) {
  const lines = buildSummary(prediction, explanation, schema);
  return (
    <Card>
      <CardHeader icon={<MessageSquareText className="h-4 w-4" aria-hidden />} title="In plain words" subtitle="What the model sees for this patient" />
      <ul className="space-y-2 px-5 pb-4 pt-1 text-sm leading-relaxed text-white/80">
        {lines.map((l) => (
          <li key={l.kind} className="flex gap-2.5">
            <span className="mt-1 shrink-0">{ICONS[l.kind]}</span>
            <span className={l.kind === "reliability" ? "text-white/55" : undefined}>{l.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
