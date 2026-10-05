import {
  BarChart3,
  ClipboardList,
  Crosshair,
  ExternalLink,
  HeartPulse,
  Home,
  Menu,
  RefreshCw,
  Tag,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, api } from "./api/client";
import type { PredictResponse, SamplePatient, Schema } from "./api/types";
import { Disclaimer } from "./components/Disclaimer";
import { Logo } from "./components/Logo";
import { PatientForm } from "./components/PatientForm";
import { PhysiologyPanel } from "./components/PhysiologyPanel";
import { Button, Card, EmptyState, Select, Sheet, Skeleton, Switch, Tip, TooltipProvider } from "./components/primitives";
import { CadStatusCard, VesselBars } from "./components/Results";
import { RiskLegend } from "./components/RiskLegend";
import { ShapWaterfall } from "./components/ShapWaterfall";
import { Tabs } from "./components/ui";
import { VesselInfo } from "./components/VesselInfo";
import { WhatIfPanel } from "./components/WhatIfPanel";
import { MOCK_PRESETS, MockPanel } from "./dev/MockPanel";
import { cn } from "./lib/cn";
import { toFormValues, validate, type FormValues } from "./lib/form";
import { usePageMeta } from "./lib/meta";
import { usePrediction } from "./lib/usePrediction";
import { useMediaQuery } from "./lib/useMediaQuery";
import { GITHUB_URL } from "./landing/Hero";
import { Link } from "./router";
import { HeartViewer } from "./scene/HeartViewer";

type Tab = "explanation" | "physiology" | "whatif";
type MobileView = "heart" | "results" | "patient";
type Connection = "connecting" | "waking" | "online" | "offline";
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

const TAB_ITEMS: { id: Tab; label: string }[] = [
  { id: "explanation", label: "Why?" },
  { id: "physiology", label: "Physiology" },
  { id: "whatif", label: "What-if" },
];
const MOBILE_TABS: { id: MobileView; label: string; icon: typeof HeartPulse }[] = [
  { id: "heart", label: "3D heart", icon: HeartPulse },
  { id: "results", label: "Results", icon: BarChart3 },
  { id: "patient", label: "Patient", icon: ClipboardList },
];

export default function App() {
  usePageMeta(
    "Clinical dashboard · CardioScope",
    "Enter or load patient data to predict coronary artery disease and LAD, LCX and RCA stenosis, see it on a 3D heart and understand why.",
  );
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
  const [mobileView, setMobileView] = useState<MobileView>("heart");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  // render exactly one layout, so only one WebGL canvas ever exists
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // 1024-1279px: no room for a third column, so the 3D view and results share one vertically scrolling column
  const isWide = useMediaQuery("(min-width: 1280px)");

  const { patient, errors } = useMemo(() => (schema ? validate(schema, values) : { patient: null, errors: {} }), [schema, values]);
  const pred = usePrediction(patient, live);
  const { prediction, explanation } = pred;
  const nErrors = Object.keys(errors).length;

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
        // "?sample=<kind>" (from the landing page's "Try a sample patient") picks the starting patient
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
    if (id) setMobileView("heart");
  };

  const editValue = (id: string, raw: string) => {
    setValues((v) => ({ ...v, [id]: raw }));
    setActiveSample(null);
  };
  const loadSample = (s: SamplePatient) => {
    if (!schema) return;
    const v = toFormValues(schema, s.patient);
    setValues(v);
    setBaseline(v);
    setActiveSample(s);
  };
  const resetForm = () => {
    if (!schema) return;
    const v = toFormValues(schema);
    setValues(v);
    setBaseline(v);
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
  const sexLabel = schema?.features.find((f) => f.id === "sex")?.options?.find((o) => String(o.value) === values.sex)?.label;
  const patientChip = schema
    ? `${activeSample ? `Example #${activeSample.patient_id}` : "Custom patient"} · ${values.age || "?"} y${sexLabel ? ` · ${sexLabel}` : ""}`
    : null;

  // ------------------------------------------------------------------ panels
  const statusDot = (
    <span className="flex items-center gap-1.5 text-xs text-white/60" title={API_URL}>
      <span className={cn("h-2 w-2 rounded-full", connection === "online" ? "bg-emerald-500" : offline ? "bg-red-500" : "animate-pulse bg-amber-400")} />
      {connection === "online" ? "Model online" : offline ? "Server offline" : "Connecting…"}
    </span>
  );

  const viewer = (
    <Card className="relative h-full overflow-hidden max-lg:min-h-[360px]">
      {hasWebGL ? (
        <HeartViewer probabilities={probabilities} selectedId={selectedVessel} onSelect={selectVessel} showLabels={showLabels} resetToken={resetToken} transparent />
      ) : (
        <EmptyState icon={<HeartPulse className="h-7 w-7" />} title="3D view unavailable">
          This browser has WebGL turned off or unsupported. All predictions and explanations are still available in Results.
        </EmptyState>
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex flex-col gap-2">
            <span className="rounded-lg bg-black/50 px-2.5 py-1 font-cabin text-[11px] uppercase tracking-wider text-white/60 backdrop-blur">3D anatomy</span>
            {offline && <MockPanel values={mockValues} onChange={setMockValues} />}
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <Tip content={showLabels ? "Hide vessel labels" : "Show vessel labels"}>
              <Button size="icon" variant="secondary" aria-label={showLabels ? "Hide vessel labels" : "Show vessel labels"} aria-pressed={showLabels} onClick={() => setShowLabels((s) => !s)}>
                <Tag className="h-4 w-4" aria-hidden />
              </Button>
            </Tip>
            <Tip content="Reset view (Esc)">
              <Button size="icon" variant="secondary" aria-label="Reset 3D view" onClick={resetView}>
                <Crosshair className="h-4 w-4" aria-hidden />
              </Button>
            </Tip>
          </div>
        </div>
        <AnimatePresence>
          {vesselInfo && (
            <motion.div
              key={vesselInfo.id}
              className="pointer-events-auto absolute right-3 top-16 max-h-[calc(100%-5rem)] overflow-y-auto overscroll-contain rounded-2xl no-scrollbar max-sm:bottom-3 max-sm:left-3 max-sm:top-auto max-sm:max-h-[62%]"
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
                  setMobileView("results");
                }}
                onClose={resetView}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className={cn("flex items-end justify-between gap-3", vesselInfo && "max-sm:hidden")}>
          <div className="pointer-events-auto">
            <RiskLegend />
          </div>
          <p className="hidden max-w-[15rem] text-right text-[11px] text-white/40 xl:block">Drag to rotate · scroll to zoom · click an artery to inspect</p>
        </div>
      </div>
      {pred.busy && (
        <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs text-white/70 backdrop-blur">
          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> Updating
        </span>
      )}
    </Card>
  );

  const errorBanner = (
    <AnimatePresence>
      {nErrors > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
          <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            Results show the last valid inputs. Fix {nErrors === 1 ? "1 field" : `${nErrors} fields`} in Patient to update them.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  const targetSelect = (idSuffix = "") =>
    schema && (
      <div className="w-36 shrink-0">
        <Select
          id={`explain-target${idSuffix}`}
          value={target}
          onValueChange={setTarget}
          options={schema.targets.map((t) => ({ value: t.id, label: t.vessel_id ? `${t.vessel_id} stenosis` : "Overall CAD" }))}
        />
      </div>
    );
  const tabBody = (t: Tab) =>
    !schema ? null : t === "whatif" ? (
      <WhatIfPanel
        schema={schema}
        values={values}
        baseline={baselineValues}
        onChange={editValue}
        onResetToBaseline={() => baselineValues && setValues(baselineValues)}
        onSetBaseline={() => setBaseline(values)}
      />
    ) : currentExplanation ? (
      t === "explanation" ? (
        <ShapWaterfall explanation={currentExplanation} />
      ) : (
        <PhysiologyPanel schema={schema} explanation={currentExplanation} />
      )
    ) : null;

  const results =
    schema && prediction ? (
      <div className="space-y-3">
        {errorBanner}
        {/* side by side when they share the scrolling column with the 3D view, so more fits at a glance */}
        <div className={cn(isDesktop && !isWide ? "grid grid-cols-2 items-start gap-3" : "space-y-3")}>
          <CadStatusCard cad={prediction.cad} schema={schema} baseline={showBaseline?.cad.probability} />
          <VesselBars prediction={prediction} schema={schema} selectedId={selectedVessel} onSelect={selectVessel} baseline={showBaseline} />
        </div>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <Tabs<Tab> value={tab} onChange={setTab} items={TAB_ITEMS} />
            {tab !== "whatif" && targetSelect()}
          </div>
          <div className="p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab + target} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                {tabBody(tab)}
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>
      </div>
    ) : offline ? (
      <Card>
        <EmptyState
          icon={<WifiOff className="h-7 w-7" />}
          title="Can't reach the prediction server"
          action={
            <Button variant="primary" onClick={loadSchema}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          }
        >
          {loadError} The 3D view still works with demo values. Start the API (see README) or try again in a moment.
        </EmptyState>
      </Card>
    ) : (
      <div className="space-y-3" aria-busy="true" aria-label="Loading results">
        <Card className="p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mx-auto mt-6 h-28 w-56 rounded-t-full" />
          <Skeleton className="mx-auto mt-4 h-3 w-40" />
        </Card>
        <Card className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </Card>
        {connection === "waking" && (
          <p className="text-center text-xs text-white/50">
            Waking up the model server (free hosting sleeps when idle)… attempt {attempt} of {WAKE_ATTEMPTS}
          </p>
        )}
      </div>
    );

  const form = schema ? (
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
      onLoadSample={loadSample}
      onReset={resetForm}
      onSubmit={() => patient && pred.run(patient)}
    />
  ) : offline ? (
    <EmptyState icon={<ClipboardList className="h-7 w-7" />} title="Patient form unavailable">
      The form is built from the model server's schema, which can't be reached right now.
    </EmptyState>
  ) : (
    <div className="space-y-3 p-4" aria-busy="true">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[72px]" />
        ))}
      </div>
      <Skeleton className="h-11" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );

  const enter = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: 0.06 * i } });

  return (
    <TooltipProvider>
      <div className="relative isolate flex h-[100dvh] flex-col overflow-hidden bg-page bg-[linear-gradient(180deg,var(--color-page-top)_0%,var(--color-page)_100%)] text-white/90">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-sky-500/[0.09] blur-[150px]" />
          <div className="absolute left-1/2 top-1/3 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[160px]" />
          <div className="absolute -right-32 bottom-0 h-[460px] w-[560px] rounded-full bg-indigo-500/[0.08] blur-[150px]" />
        </div>

        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-surface/70 px-3 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="CardioScope home" className="inline-flex min-h-11 items-center rounded-lg">
              <Logo />
            </Link>
            <span className="hidden rounded-md border border-white/10 px-2 py-0.5 font-cabin text-[11px] uppercase tracking-wider text-white/50 md:inline">Dashboard</span>
          </div>
          {patientChip && (
            <motion.span
              key={patientChip}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="hidden truncate rounded-full border border-white/10 bg-surface-2 px-3 py-1 font-manrope text-xs text-white/75 lg:block"
            >
              {patientChip}
            </motion.span>
          )}
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-4 md:flex">
              {statusDot}
              <Switch id="live-switch" checked={live} onCheckedChange={setLive} label="Live updates" />
            </div>
            <Button size="icon" variant="ghost" className="md:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </header>
        <Disclaimer />
        {pred.error && connection === "online" && (
          <div role="alert" className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
            {pred.error}
          </div>
        )}

        {isDesktop ? (
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 p-3",
            isWide ? "grid-cols-[minmax(320px,370px)_1fr_minmax(360px,430px)]" : "grid-cols-[320px_minmax(0,1fr)]",
          )}
        >
          <motion.aside {...enter(0)} className="card-surface min-h-0 overflow-hidden rounded-2xl" aria-label="Patient data">
            {form}
          </motion.aside>
          {isWide ? (
            <>
              <motion.div {...enter(1)} className="min-h-0">
                {viewer}
              </motion.div>
              <motion.aside {...enter(2)} className="min-h-0 overflow-y-auto pb-2 pr-1 strip-scrollbar" aria-label="Results">
                {results}
              </motion.aside>
            </>
          ) : (
            // one column scrolls vertically: 3D view on top, every result card below it
            <motion.div {...enter(1)} className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain pb-2 pr-1 strip-scrollbar">
              <div className="h-[60vh] min-h-[320px]">{viewer}</div>
              <section aria-label="Results">{results}</section>
            </motion.div>
          )}
        </div>
        ) : (
        <>
        {/* phone / small tablet: one view at a time + bottom tab bar; the 3D view stays mounted */}
        <div className="relative min-h-0 flex-1">
          <div className={cn("absolute inset-0 p-3 transition-opacity duration-200", mobileView === "heart" ? "z-10 opacity-100" : "pointer-events-none opacity-0")} aria-hidden={mobileView !== "heart"}>
            {viewer}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {mobileView !== "heart" && (
              <motion.div
                key={mobileView}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.22 }}
                className="absolute inset-0 z-20 overflow-y-auto p-3 no-scrollbar"
              >
                {mobileView === "results" ? results : <div className="card-surface h-full overflow-hidden rounded-2xl">{form}</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <nav aria-label="Dashboard sections" className="grid shrink-0 grid-cols-3 border-t border-white/[0.07] bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          {MOBILE_TABS.map(({ id, label, icon: Icon }) => {
            const on = mobileView === id;
            return (
              <button
                key={id}
                onClick={() => setMobileView(id)}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 font-manrope text-[11px] font-semibold transition-colors", on ? "text-white" : "text-white/45")}
              >
                {on && <motion.span layoutId="mobile-tab" className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />}
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>
        </>
        )}

        <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-surface-2 p-3">{statusDot}</div>
            <div className="space-y-3 rounded-xl border border-white/10 bg-surface-2 p-3">
              <Switch id="live-switch-mobile" checked={live} onCheckedChange={setLive} label="Live updates" />
              <Switch id="labels-switch-mobile" checked={showLabels} onCheckedChange={setShowLabels} label="Vessel labels" />
            </div>
            {samples.length > 0 && (
              <div>
                <p className="mb-2 font-cabin text-xs uppercase tracking-wider text-white/45">Example patients</p>
                <div className="space-y-2">
                  {samples.map((s) => (
                    <Button
                      key={s.kind}
                      variant={activeSample?.kind === s.kind ? "primary" : "secondary"}
                      className="w-full justify-start"
                      onClick={() => {
                        loadSample(s);
                        setMenuOpen(false);
                        setMobileView("results");
                      }}
                    >
                      {s.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1 border-t border-white/10 pt-4">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  resetView();
                  setMenuOpen(false);
                  setMobileView("heart");
                }}
              >
                <Crosshair className="h-4 w-4" aria-hidden /> Reset 3D view
              </Button>
              <Link href="/" onClick={() => setMenuOpen(false)} className="flex h-11 items-center gap-2 rounded-lg px-4 font-manrope text-sm font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white">
                <Home className="h-4 w-4" aria-hidden /> Home
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-lg px-4 font-manrope text-sm font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white">
                <ExternalLink className="h-4 w-4" aria-hidden /> Source code
              </a>
            </div>
          </div>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
