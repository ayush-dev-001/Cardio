import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, api } from "./api/client";
import type { ExplainResponse, Patient, PredictResponse, SamplePatient, Schema } from "./api/types";
import { Disclaimer } from "./components/Disclaimer";
import { PatientForm } from "./components/PatientForm";
import { PhysiologyPanel } from "./components/PhysiologyPanel";
import { CadStatusCard, VesselBars } from "./components/Results";
import { RiskLegend } from "./components/RiskLegend";
import { ShapWaterfall } from "./components/ShapWaterfall";
import { Panel, Tabs } from "./components/ui";
import { VesselInfo } from "./components/VesselInfo";
import { MOCK_PRESETS, MockPanel } from "./dev/MockPanel";
import { toFormValues, validate, type FormValues } from "./lib/form";
import { HeartViewer } from "./scene/HeartViewer";

type Tab = "explanation" | "physiology";
const headerBtn = "rounded-md border border-slate-700 px-2.5 py-1 hover:border-slate-500";

export default function App() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [samples, setSamples] = useState<SamplePatient[]>([]);
  const [values, setValues] = useState<FormValues>({});
  const [activeSample, setActiveSample] = useState<SamplePatient | null>(null);
  const [prediction, setPrediction] = useState<PredictResponse | null>(null);
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null); // JSON of the last predicted patient
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [mockValues, setMockValues] = useState(MOCK_PRESETS.single.values);

  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("cad");
  const [tab, setTab] = useState<Tab>("explanation");
  const [showLabels, setShowLabels] = useState(true);
  const [resetToken, setResetToken] = useState(0);

  const { patient, errors } = useMemo(
    () => (schema ? validate(schema, values) : { patient: null, errors: {} }),
    [schema, values],
  );
  const dirty = patient !== null && JSON.stringify(patient) !== submitted;

  const runPrediction = useCallback(async (p: Patient) => {
    setBusy(true);
    setError(null);
    try {
      const [pred, expl] = await Promise.all([api.predict(p), api.explain(p)]);
      setPrediction(pred);
      setExplanation(expl);
      setSubmitted(JSON.stringify(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSchema = useCallback(async () => {
    setError(null);
    try {
      const [s, smp] = await Promise.all([api.schema(), api.samples()]);
      setSchema(s);
      setSamples(smp);
      setOffline(false);
      const initial = smp.find((x) => x.kind === "single_vessel") ?? null;
      const v = toFormValues(s, initial?.patient);
      setValues(v);
      setActiveSample(initial);
      const { patient: p } = validate(s, v);
      if (p) await runPrediction(p);
    } catch (e) {
      setOffline(true);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [runPrediction]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

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

  const probabilities: Record<string, number> = prediction
    ? Object.fromEntries(prediction.vessels.map((v) => [v.vessel_id, v.probability]))
    : offline
      ? mockValues
      : {};
  const currentExplanation = explanation?.explanations.find((e) => e.target_id === target) ?? null;
  const vesselInfo = schema?.vessels.find((v) => v.id === selectedVessel) ?? null;

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold tracking-tight text-white">CardioScope</h1>
          <span className="hidden text-xs text-slate-500 md:inline">Coronary risk prediction & 3D visualisation</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden items-center gap-1.5 text-slate-400 sm:flex" title={API_URL}>
            <span className={`h-2 w-2 rounded-full ${offline ? "bg-red-500" : schema ? "bg-emerald-500" : "bg-slate-500"}`} />
            {offline ? "API offline" : schema ? "API connected" : "Connecting…"}
          </span>
          <button onClick={() => setShowLabels((s) => !s)} className={headerBtn}>
            {showLabels ? "Hide" : "Show"} labels
          </button>
          <button onClick={resetView} className={headerBtn}>
            Reset view
          </button>
        </div>
      </header>
      <Disclaimer />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          <span>
            {error}
            {offline && " Showing the 3D view with demo values; start the backend and retry."}
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
        {/* 3D view: first on small screens, centre column on large ones */}
        <main className="relative h-[58vh] min-h-[380px] lg:col-start-2 lg:row-start-1 xl:h-auto">
          <HeartViewer
            probabilities={probabilities}
            selectedId={selectedVessel}
            onSelect={selectVessel}
            showLabels={showLabels}
            resetToken={resetToken}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="pointer-events-auto">{offline && <MockPanel values={mockValues} onChange={setMockValues} />}</div>
              {vesselInfo && (
                <div className="pointer-events-auto">
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
                </div>
              )}
            </div>
            <div className="flex items-end justify-between gap-3">
              <RiskLegend />
              <p className="hidden max-w-[16rem] text-right text-[11px] text-slate-500 xl:block">
                Drag to rotate · scroll to zoom · click an artery to inspect · Esc to reset
              </p>
            </div>
          </div>
          {busy && <div className="absolute right-3 top-3 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-300">Updating…</div>}
        </main>

        {/* results */}
        <aside className="space-y-3 p-3 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1 xl:overflow-y-auto xl:border-l xl:border-slate-800">
          {schema && prediction ? (
            <>
              <CadStatusCard cad={prediction.cad} schema={schema} />
              <VesselBars prediction={prediction} schema={schema} selectedId={selectedVessel} onSelect={selectVessel} />
              <Panel
                title={
                  <Tabs<Tab>
                    value={tab}
                    onChange={setTab}
                    items={[
                      { id: "explanation", label: "Why? (SHAP)" },
                      { id: "physiology", label: "Physiology" },
                    ]}
                  />
                }
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
                {currentExplanation &&
                  (tab === "explanation" ? (
                    <ShapWaterfall explanation={currentExplanation} />
                  ) : (
                    <PhysiologyPanel schema={schema} explanation={currentExplanation} />
                  ))}
              </Panel>
            </>
          ) : (
            <Panel>
              <p className="text-sm text-slate-400">{offline ? "Results appear once the API is reachable." : "Loading model results…"}</p>
            </Panel>
          )}
        </aside>

        {/* patient form */}
        <aside className="border-t border-slate-800 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r lg:border-t-0 xl:row-span-1 xl:overflow-y-auto">
          {schema ? (
            <PatientForm
              schema={schema}
              values={values}
              errors={errors}
              derived={prediction?.derived_inputs ?? null}
              samples={samples}
              activeSample={activeSample}
              busy={busy}
              dirty={dirty}
              onChange={(id, raw) => {
                setValues((v) => ({ ...v, [id]: raw }));
                setActiveSample(null);
              }}
              onLoadSample={(s) => {
                const v = toFormValues(schema, s.patient);
                setValues(v);
                setActiveSample(s);
                const { patient: p } = validate(schema, v);
                if (p) runPrediction(p);
              }}
              onReset={() => {
                setValues(toFormValues(schema));
                setActiveSample(null);
              }}
              onSubmit={() => patient && runPrediction(patient)}
            />
          ) : (
            <p className="p-4 text-sm text-slate-500">{offline ? "Patient form unavailable while the API is offline." : "Loading form…"}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
