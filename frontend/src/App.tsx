import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, api } from "./api/client";
import type { PredictResponse, SamplePatient, Schema } from "./api/types";
import { Disclaimer } from "./components/Disclaimer";
import { Logo } from "./components/Logo";
import { PatientForm } from "./components/PatientForm";
import { PhysiologyPanel } from "./components/PhysiologyPanel";
import { CadStatusCard, VesselBars } from "./components/Results";
import { RiskLegend } from "./components/RiskLegend";
import { ShapWaterfall } from "./components/ShapWaterfall";
import { Panel, Tabs } from "./components/ui";
import { VesselInfo } from "./components/VesselInfo";
import { WhatIfPanel } from "./components/WhatIfPanel";
import { MOCK_PRESETS, MockPanel } from "./dev/MockPanel";
import { toFormValues, validate, type FormValues } from "./lib/form";
import { usePrediction } from "./lib/usePrediction";
import { Link } from "./router";
import { HeartViewer } from "./scene/HeartViewer";

type Tab = "explanation" | "physiology" | "whatif";
type Connection = "connecting" | "waking" | "online" | "offline";
const headerBtn =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 font-manrope text-xs font-medium text-white/80 transition-colors duration-200 hover:border-white/30 hover:text-white";
// Free hosting may put the API to sleep; keep retrying for about a minute before giving up.
const WAKE_ATTEMPTS = 12;
const WAKE_DELAY_MS = 5000;

const hasWebGL = (() => {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
})();

export default function App() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [samples, setSamples] = useState<SamplePatient[]>([]);
  const [values, setValues] = useState<FormValues>({});
  const [activeSample, setActiveSample] = useState<SamplePatient | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mockValues, setMockValues] = useState(MOCK_PRESETS.single.values);
  const [live, setLive] = useState(true);

  const [baselineValues, setBaselineValues] = useState<FormValues | null>(null);
  const [baselinePrediction, setBaselinePrediction] = useState<PredictResponse | null>(null);

  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("cad");
  const [tab, setTab] = useState<Tab>("explanation");
  const [showLabels, setShowLabels] = useState(true);
  const [resetToken, setResetToken] = useState(0);

  const { patient, errors } = useMemo(
    () => (schema ? validate(schema, values) : { patient: null, errors: {} }),
    [schema, values],
  );
  const pred = usePrediction(patient, live);
  const { prediction, explanation } = pred;

  // ------------------------------------------------------------------ loading / waking the API
  const loadSchema = useCallback(async () => {
    setLoadError(null);
    for (let i = 1; i <= WAKE_ATTEMPTS; i++) {
      setAttempt(i);
      setConnection(i === 1 ? "connecting" : "waking");
      try {
        const [s, smp] = await Promise.all([api.schema(), api.samples()]);
        setSchema(s);
        setSamples(smp);
        // "?sample=<kind>" (e.g. from the landing page's "Try a sample patient") picks the starting patient
        const wanted = new URLSearchParams(window.location.search).get("sample") ?? "single_vessel";
        const initial = smp.find((x) => x.kind === wanted) ?? smp.find((x) => x.kind === "single_vessel") ?? null;
        const v = toFormValues(s, initial?.patient);
        setValues(v);
        setBaselineValues(v);
        setActiveSample(initial);
        setConnection("online");
        return;
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        if (i < WAKE_ATTEMPTS) await new Promise((r) => setTimeout(r, WAKE_DELAY_MS));
      }
    }
    setConnection("offline");
  }, []);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  // the baseline's prediction is captured once results for the baseline inputs arrive
  const baselineKey = useMemo(() => {
    if (!schema || !baselineValues) return null;
    const p = validate(schema, baselineValues).patient;
    return p ? JSON.stringify(p) : null;
  }, [schema, baselineValues]);
  useEffect(() => {
    if (baselineKey && pred.submittedKey === baselineKey && prediction) setBaselinePrediction(prediction);
  }, [baselineKey, pred.submittedKey, prediction]);

  const setBaseline = (v: FormValues) => {
    setBaselineValues(v);
    setBaselinePrediction(null);
  };

  // ------------------------------------------------------------------ view interactions
  const resetView = useCallback(() => {
    setSelectedVessel(null);
    setResetToken((t) => t + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetView]);

  const selectVessel = (id: string | null) => {
    setSelectedVessel(id);
    const t = schema?.vessels.find((v) => v.id === id)?.target_id;
    if (t) setTarget(t);
  };

  const editValue = (id: string, raw: string) => {
    setValues((v) => ({ ...v, [id]: raw }));
    setActiveSample(null);
  };

  const offline = connection === "offline";
  const probabilities: Record<string, number> = prediction
    ? Object.fromEntries(prediction.vessels.map((v) => [v.vessel_id, v.probability]))
    : offline
      ? mockValues
      : {};
  const currentExplanation = explanation?.explanations.find((e) => e.target_id === target) ?? null;
  const vesselInfo = schema?.vessels.find((v) => v.id === selectedVessel) ?? null;
  const showBaseline = baselinePrediction && pred.submittedKey !== baselineKey ? baselinePrediction : null;
  const error = pred.error ?? (offline ? loadError : null);

  return (
    <div className="relative isolate flex h-full flex-col bg-ink text-white/90">
      {/* soft brand glows give the glass panels something to frost */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute -right-32 top-1/3 h-[480px] w-[480px] rounded-full bg-[#4c1d95]/25 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 h-[360px] w-[520px] rounded-full bg-plum/40 blur-[120px]" />
      </div>
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-ink/60 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="CardioScope home" className="rounded-lg">
            <Logo />
          </Link>
          <h1 className="hidden border-l border-white/10 pl-3 font-manrope text-xs font-medium text-white/50 md:block">Clinical dashboard</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden items-center gap-1.5 text-slate-400 sm:flex" title={API_URL}>
            <span
              className={`h-2 w-2 rounded-full ${
                connection === "online" ? "bg-emerald-500" : connection === "offline" ? "bg-red-500" : "animate-pulse bg-amber-400"
              }`}
            />
            {connection === "online" ? "API connected" : connection === "offline" ? "API offline" : "Connecting…"}
          </span>
          <label className={headerBtn}>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-violet-500" />
            Live updates
          </label>
          <button onClick={() => setShowLabels((s) => !s)} className={`${headerBtn} hidden sm:block`}>
            {showLabels ? "Hide" : "Show"} labels
          </button>
          <button onClick={resetView} className={headerBtn}>
            Reset view
          </button>
        </div>
      </header>
      <Disclaimer />

      {connection === "waking" && (
        <div role="status" className="border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-white/80">
          Waking up the model server (free hosting sleeps when idle; this can take up to a minute)… attempt {attempt} of {WAKE_ATTEMPTS}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          <span>
            {error}
            {offline && " Showing the 3D view with demo values."}
          </span>
          {offline && (
            <button onClick={loadSchema} className="rounded border border-red-400/50 px-2 py-0.5 hover:bg-red-500/20">
              Retry
            </button>
          )}
        </div>
      )}

      {/* phone: one column (3D, results, form) · lg: form | 3D over results · xl: form | 3D | results */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden lg:grid lg:grid-cols-[340px_1fr] lg:content-start xl:grid-cols-[minmax(320px,360px)_1fr_minmax(360px,420px)] xl:overflow-hidden">
        <main className="relative h-[58vh] min-h-[380px] lg:col-start-2 lg:row-start-1 xl:h-auto">
          {hasWebGL ? (
            <HeartViewer
              probabilities={probabilities}
              selectedId={selectedVessel}
              onSelect={selectVessel}
              showLabels={showLabels}
              resetToken={resetToken}
              transparent
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
              3D view unavailable: this browser has WebGL turned off or unsupported. All predictions and explanations are still
              shown in the panels.
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="pointer-events-auto">{offline && <MockPanel values={mockValues} onChange={setMockValues} />}</div>
              <AnimatePresence>
              {vesselInfo && (
                <motion.div
                  key={vesselInfo.id}
                  className="pointer-events-auto"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.25 }}
                >
                  <VesselInfo
                    vessel={vesselInfo}
                    prediction={prediction?.vessels.find((v) => v.vessel_id === vesselInfo.id) ?? null}
                    explanation={explanation?.explanations.find((e) => e.target_id === vesselInfo.target_id) ?? null}
                    onShowExplanation={() => {
                      setTarget(vesselInfo.target_id);
                      setTab("explanation");
                    }}
                    onClose={resetView}
                  />
                </motion.div>
              )}
              </AnimatePresence>
            </div>
            <div className="flex items-end justify-between gap-3">
              <RiskLegend />
              <p className="hidden max-w-[16rem] text-right text-[11px] text-slate-500 xl:block">
                Drag to rotate · scroll to zoom · click an artery to inspect · Esc to reset
              </p>
            </div>
          </div>
          {pred.busy && <div className="glass absolute right-3 top-3 rounded-lg px-2.5 py-1 text-xs text-white/70">Updating…</div>}
        </main>

        <aside className="space-y-3 p-3 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1 xl:overflow-y-auto xl:border-l xl:border-white/10">
          {schema && prediction ? (
            <>
              <CadStatusCard cad={prediction.cad} schema={schema} baseline={showBaseline?.cad.probability} />
              <VesselBars
                prediction={prediction}
                schema={schema}
                selectedId={selectedVessel}
                onSelect={selectVessel}
                baseline={showBaseline}
              />
              {tab === "whatif" ? (
                <div className="space-y-2">
                  <Tabs<Tab> value={tab} onChange={setTab} items={TAB_ITEMS} />
                  <WhatIfPanel
                    schema={schema}
                    values={values}
                    baseline={baselineValues}
                    onChange={editValue}
                    onResetToBaseline={() => baselineValues && setValues(baselineValues)}
                    onSetBaseline={() => setBaseline(values)}
                  />
                </div>
              ) : (
                <Panel
                  title={<Tabs<Tab> value={tab} onChange={setTab} items={TAB_ITEMS} />}
                  right={
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      aria-label="Target to explain"
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                    >
                      {schema.targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.vessel_id ?? "Overall CAD"}
                        </option>
                      ))}
                    </select>
                  }
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {currentExplanation && (
                      <motion.div
                        key={tab + target}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                      >
                        {tab === "explanation" ? (
                          <ShapWaterfall explanation={currentExplanation} />
                        ) : (
                          <PhysiologyPanel schema={schema} explanation={currentExplanation} />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Panel>
              )}
            </>
          ) : (
            <Panel>
              <p className="text-sm text-slate-400">
                {offline ? "Results appear once the API is reachable." : connection === "waking" ? "Waiting for the model server…" : "Loading model results…"}
              </p>
            </Panel>
          )}
        </aside>

        <aside className="border-t border-white/10 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r lg:border-t-0 xl:row-span-1 xl:overflow-y-auto">
          {schema ? (
            <PatientForm
              schema={schema}
              values={values}
              errors={errors}
              derived={prediction?.derived_inputs ?? null}
              samples={samples}
              activeSample={activeSample}
              busy={pred.busy}
              dirty={pred.dirty}
              live={live}
              latencyMs={pred.latencyMs}
              onChange={editValue}
              onLoadSample={(s) => {
                const v = toFormValues(schema, s.patient);
                setValues(v);
                setBaseline(v);
                setActiveSample(s);
              }}
              onReset={() => {
                const v = toFormValues(schema);
                setValues(v);
                setBaseline(v);
                setActiveSample(null);
              }}
              onSubmit={() => patient && pred.run(patient)}
            />
          ) : (
            <p className="p-4 text-sm text-slate-500">{offline ? "Patient form unavailable while the API is offline." : "Loading form…"}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

const TAB_ITEMS: { id: Tab; label: string }[] = [
  { id: "explanation", label: "Why? (SHAP)" },
  { id: "physiology", label: "Physiology" },
  { id: "whatif", label: "What-if" },
];
