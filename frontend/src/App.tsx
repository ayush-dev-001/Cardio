import { useEffect, useState } from "react";
import { VESSELS } from "./anatomy/anatomy";
import { Disclaimer } from "./components/Disclaimer";
import { RiskLegend } from "./components/RiskLegend";
import { VesselInfo } from "./components/VesselInfo";
import { MOCK_PRESETS, MockPanel } from "./dev/MockPanel";
import { HeartViewer } from "./scene/HeartViewer";

const headerBtn = "rounded-md border border-slate-700 px-2.5 py-1 hover:border-slate-500";

export default function App() {
  const [probabilities, setProbabilities] = useState<Record<string, number>>(MOCK_PRESETS.single.values);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const selected = VESSELS.find((v) => v.id === selectedId) ?? null;

  const resetView = () => {
    setSelectedId(null);
    setResetToken((t) => t + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold tracking-tight text-white">CardioScope</h1>
          <span className="hidden text-xs text-slate-500 sm:inline">Coronary risk visualisation</span>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={() => setShowLabels((s) => !s)} className={headerBtn}>
            {showLabels ? "Hide" : "Show"} labels
          </button>
          <button onClick={resetView} className={headerBtn}>
            Reset view
          </button>
        </div>
      </header>
      <Disclaimer />
      <main className="relative min-h-0 flex-1">
        <HeartViewer
          probabilities={probabilities}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showLabels={showLabels}
          resetToken={resetToken}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
            <div className="pointer-events-auto">
              <MockPanel values={probabilities} onChange={setProbabilities} />
            </div>
            {selected && (
              <div className="pointer-events-auto">
                <VesselInfo vessel={selected} probability={probabilities[selected.id] ?? 0} onClose={resetView} />
              </div>
            )}
          </div>
          <div className="flex items-end justify-between gap-3">
            <RiskLegend />
            <p className="hidden max-w-xs text-right text-xs text-slate-500 md:block">
              Drag to rotate · scroll to zoom · click an artery to focus · Esc to reset
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
