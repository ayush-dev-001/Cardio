import {
  ArrowRight,
  BarChart3,
  Box,
  Cpu,
  Gauge,
  MapPinOff,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { AnimatePresence, motion, useInView, useScroll, useTransform } from "motion/react";
import { Suspense, lazy, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { riskColor } from "../anatomy/riskColor";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Logo } from "../components/Logo";
import { usePageMeta } from "../lib/meta";
import { Link } from "../router";
import { GITHUB_URL, Hero } from "./Hero";
import { CountUp, Marquee, Reveal, ScrollProgress, TiltCard, WordReveal } from "./motion";
import { METRICS } from "./metrics";

const HeroHeart = lazy(() => import("./HeroHeart"));
const container = "mx-auto w-full max-w-6xl px-6";
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Serif section title with an optional italic accent phrase. */
function SectionHeading({ eyebrow, title, accent, children }: { eyebrow: string; title: string; accent?: string; children?: ReactNode }) {
  return (
    <Reveal className="mx-auto mb-14 max-w-2xl text-center">
      <p className="font-cabin text-sm font-medium uppercase tracking-[0.18em] text-primary-soft">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
        <WordReveal text={title} /> {accent && <em className="italic text-brand-300"><WordReveal text={accent} /></em>}
      </h2>
      {children && <p className="mt-5 text-base leading-relaxed text-white/60">{children}</p>}
    </Reveal>
  );
}

/** Glass card with a soft purple spotlight following the cursor (no layout shift). */
function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setPos(null)}
      className={`glass relative h-full overflow-hidden rounded-2xl p-6 transition-colors duration-300 hover:border-white/20 ${className}`}
    >
      {pos && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(340px circle at ${pos.x}px ${pos.y}px, rgba(123,57,252,0.16), transparent 70%)` }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

function IconBadge({ icon: Icon }: { icon: typeof Box }) {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-xl border border-primary/30 bg-primary/15 text-brand-300">
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

// ------------------------------------------------------------------------------- showcase
const SCENES = [
  { title: "Normal coronaries", cad: 0.04, values: { LAD: 0.08, LCX: 0.12, RCA: 0.1 } },
  { title: "Single-vessel disease", cad: 0.97, values: { LAD: 0.86, LCX: 0.22, RCA: 0.18 } },
  { title: "Multi-vessel disease", cad: 0.99, values: { LAD: 0.91, LCX: 0.74, RCA: 0.82 } },
];

function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [i, setI] = useState(1);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setI((x) => (x + 1) % SCENES.length), 3800);
    return () => clearInterval(t);
  }, [inView]);
  const scene = SCENES[i];

  return (
    <section id="showcase" className="relative scroll-mt-8 py-24">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-24 h-[520px] w-[820px] max-w-full -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <div className={`${container} relative`}>
        <SectionHeading eyebrow="The product" title="Prediction, anatomy and explanation," accent="on one screen">
          Every artery takes the colour of its predicted stenosis probability. Drag to rotate the heart.
        </SectionHeading>

        <div ref={ref} className="grid items-stretch gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Reveal className="glass relative h-[420px] overflow-hidden rounded-3xl sm:h-[500px]">
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-white/50">Loading 3D heart…</div>}>
              <HeroHeart values={scene.values} />
            </Suspense>
            <span className="absolute left-4 top-4 rounded-md bg-black/50 px-2 py-1 font-cabin text-[11px] uppercase tracking-wider text-white/60">
              Illustrative values
            </span>
          </Reveal>

          <Reveal delay={0.1} className="flex flex-col gap-5">
            <div className="glass rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <p className="font-cabin text-sm text-white/60">Scenario</p>
                <div className="flex gap-1.5" role="tablist" aria-label="Demo scenario">
                  {SCENES.map((s, k) => (
                    <button
                      key={s.title}
                      role="tab"
                      aria-selected={k === i}
                      aria-label={s.title}
                      onClick={() => setI(k)}
                      className={`h-2.5 rounded-full transition-all duration-300 ${k === i ? "w-7 bg-primary" : "w-2.5 bg-white/25 hover:bg-white/40"}`}
                    />
                  ))}
                </div>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={scene.title}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="mt-2 font-serif text-3xl text-white"
                >
                  {scene.title}
                </motion.p>
              </AnimatePresence>
              <div className="mt-5 flex items-end gap-3">
                <span className="font-manrope text-5xl font-bold tabular-nums text-white">
                  <AnimatedNumber value={scene.cad} format={pct} />
                </span>
                <span className="pb-2 text-sm text-white/60">overall CAD probability</span>
              </div>
            </div>

            <div className="glass flex-1 rounded-3xl p-6">
              <p className="font-cabin text-sm text-white/60">Stenosis probability per vessel</p>
              <ul className="mt-4 space-y-4">
                {Object.entries(scene.values).map(([v, p]) => (
                  <li key={v}>
                    <div className="mb-1.5 flex justify-between font-manrope text-sm">
                      <span className="font-semibold text-white">{v}</span>
                      <span className="tabular-nums text-white/80">
                        <AnimatedNumber value={p} format={pct} />
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
                        style={{ width: `${p * 100}%`, background: riskColor(p) }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/app"
                className="group mt-6 inline-flex min-h-11 items-center gap-1.5 font-cabin text-sm font-medium text-brand-300 transition-colors duration-200 hover:text-white"
              >
                Run it on your own patient data
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------- stats
function Stats() {
  const items = [
    { value: METRICS.patients, label: "patients in the training data" },
    { value: METRICS.features, label: "clinical, ECG, lab and echo inputs" },
    { value: METRICS.rows[0].auc.mean, decimals: 2, label: "ROC-AUC for overall CAD" },
    { value: METRICS.families, label: "model families compared per target" },
  ];
  return (
    <section aria-label="Key numbers" className="py-10">
      <div className={container}>
        <div className="glass grid grid-cols-2 gap-y-8 rounded-3xl px-6 py-8 lg:grid-cols-4">
          {items.map(({ value, decimals, label }, k) => (
            <Reveal key={label} delay={k * 0.06} className="px-4 text-center lg:border-l lg:border-white/10 lg:first:border-0">
              <div className="font-serif text-5xl text-white">
                <CountUp value={value} decimals={decimals} />
              </div>
              <p className="mt-2 text-sm text-white/60">{label}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------- how it works
function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 55%"] });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const steps = [
    {
      title: "Enter clinical data",
      text: "Demographics, history, examination, ECG, labs and echo. Search any measurement, or load a real example patient in one click.",
    },
    {
      title: "Calibrated models predict",
      text: "Separate models estimate overall CAD and LAD, LCX and RCA stenosis. Each is the best of four model families, calibrated and tuned for sensitivity.",
    },
    {
      title: "See it and understand it",
      text: "Arteries light up on the 3D heart. A SHAP waterfall and physiology panel show which findings pushed risk up or down.",
    },
  ];
  return (
    <section id="how" className="relative scroll-mt-8 py-24">
      <div className={container}>
        <SectionHeading eyebrow="How it works" title="From bedside data to a" accent="vessel-level picture" />
        <div ref={ref} role="list" className="relative grid gap-5 md:grid-cols-3">
          <motion.div
            aria-hidden
            style={{ scaleX: lineScale }}
            className="pointer-events-none absolute left-[8%] right-[8%] top-[52px] z-0 hidden h-[2px] origin-left rounded-full bg-gradient-to-r from-primary via-brand-400 to-primary md:block"
          />
          {steps.map(({ title, text }, k) => (
            <Reveal key={title} delay={k * 0.1}>
              <div role="listitem" className="glass relative h-full rounded-2xl p-6">
                <span className="relative z-10 grid h-12 w-12 place-items-center rounded-full border border-primary/40 bg-ink font-serif text-2xl text-brand-300">
                  {k + 1}
                </span>
                <h3 className="mt-5 font-manrope text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------- features
function Features() {
  const items = [
    { icon: Box, title: "3D vessel risk map", text: "A translucent torso and heart with the LAD, LCX and RCA along their real courses. Rotate, zoom, click a vessel to inspect it.", wide: true },
    { icon: BarChart3, title: "Exact explanations", text: "SHAP values that add up exactly to each probability, from the average patient to this one." },
    { icon: Gauge, title: "Physiology at a glance", text: "Every measurement against its normal range, beside its contribution." },
    { icon: SlidersHorizontal, title: "What-if, live", text: "Move blood pressure, lipids or smoking and watch probabilities and the heart update in well under a second." },
    { icon: ShieldCheck, title: "Validated, not just trained", text: `Nested cross-validation (${METRICS.outerFolds} folds × ${METRICS.repeats} repeats), bootstrap 95% CIs, calibrated probabilities.`, wide: true },
    { icon: Cpu, title: "Runs on any laptop", text: "No GPU needed: on-demand 3D rendering and lightweight models." },
  ];
  return (
    <section id="features" className="relative scroll-mt-8 py-24">
      <div aria-hidden className="pointer-events-none absolute right-0 top-40 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[130px]" />
      <div className={`${container} relative`}>
        <SectionHeading eyebrow="Features" title="Built for clinicians who want" accent="the reasoning">
          Predictions, anatomy and explanations update together as you change any input.
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {items.map(({ icon, title, text, wide }, k) => (
            <Reveal key={title} delay={(k % 3) * 0.06} className={wide ? "md:col-span-2" : ""}>
              <TiltCard className="h-full">
              <GlassCard>
                <IconBadge icon={icon} />
                <h3 className="mt-5 font-manrope text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{text}</p>
              </GlassCard>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------- results
function Results() {
  return (
    <section id="results" className="scroll-mt-8 py-24">
      <div className={container}>
        <SectionHeading eyebrow="Results" title="Honest numbers," accent="including the weaker ones">
          Repeated nested cross-validation on {METRICS.patients} patients with 95% bootstrap confidence intervals. Overall CAD and
          LAD are predicted well; LCX and RCA only moderately, because routine clinical data carries little vessel-specific signal.
        </SectionHeading>
        <Reveal>
          <div className="glass overflow-x-auto rounded-3xl">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="sr-only">Cross-validated performance per prediction target</caption>
              <thead className="border-b border-white/10 font-cabin text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <th scope="col" className="px-6 py-4 font-medium">Target</th>
                  <th scope="col" className="px-6 py-4 font-medium">Model</th>
                  <th scope="col" className="px-6 py-4 font-medium">ROC-AUC (95% CI)</th>
                  <th scope="col" className="px-6 py-4 font-medium">Sensitivity</th>
                  <th scope="col" className="px-6 py-4 font-medium">Specificity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {METRICS.rows.map((r) => (
                  <tr key={r.id} className="transition-colors duration-200 hover:bg-white/[0.03]">
                    <th scope="row" className="px-6 py-4 font-manrope font-semibold text-white">{r.label}</th>
                    <td className="px-6 py-4 text-white/70">{r.model}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-10 font-manrope font-semibold tabular-nums text-white">{r.auc.mean.toFixed(2)}</span>
                        <div className="relative hidden h-1.5 w-28 rounded-full bg-white/10 sm:block" aria-hidden>
                          <div
                            className="absolute inset-y-0 rounded-full bg-primary/60"
                            style={{ left: `${(r.auc.ci_low - 0.5) * 200}%`, right: `${100 - (r.auc.ci_high - 0.5) * 200}%` }}
                          />
                          <div className="absolute -top-0.5 h-2.5 w-1 rounded bg-brand-300" style={{ left: `${(r.auc.mean - 0.5) * 200}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-white/50">
                          {r.auc.ci_low.toFixed(2)}–{r.auc.ci_high.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 tabular-nums text-white/70">{pct(r.sensitivity.mean)}</td>
                    <td className="px-6 py-4 tabular-nums text-white/70">{pct(r.specificity.mean)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-white/50">
            AUC bar spans 0.5 (chance) to 1.0. Thresholds favour sensitivity (≥{pct(METRICS.rows[0].minRecall)} for CAD, ≥
            {pct(METRICS.rows[1].minRecall)} per vessel), so specificity is lower by design.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------- responsible use
function Responsible() {
  const points = [
    { icon: ShieldAlert, title: "Decision support only", text: "CardioScope does not diagnose. It is not a substitute for coronary angiography or other formal imaging." },
    { icon: MapPinOff, title: "Per-vessel, not per-lesion", text: "Each artery is coloured by its predicted stenosis probability. The view does not show where a lesion sits." },
    { icon: Users, title: "Small, single-centre data", text: `Trained on ${METRICS.patients} patients from one centre, without external validation. A research prototype.` },
  ];
  return (
    <section id="responsible" className="scroll-mt-8 py-24">
      <div className={container}>
        <SectionHeading eyebrow="Responsible use" title="Clear about what it is," accent="and what it is not" />
        <div className="grid gap-5 md:grid-cols-3">
          {points.map(({ icon: Icon, title, text }, k) => (
            <Reveal key={title} delay={k * 0.06}>
              <div className="glass h-full rounded-2xl p-6">
                <Icon className="h-6 w-6 text-amber-300" aria-hidden />
                <h3 className="mt-5 font-manrope text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-24">
      <div className={container}>
        <Reveal className="relative isolate overflow-hidden rounded-[28px] border border-primary/30 px-6 py-16 text-center">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(123,57,252,0.45),rgba(43,35,68,0.6)_45%,rgba(11,8,20,1)_80%)]" />
          <h2 className="font-serif text-4xl leading-[1.1] text-white sm:text-6xl">
            Try it with a <em className="italic text-brand-300">real</em> patient
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/70">
            Load a normal, single-vessel or multi-vessel case from the dataset, then change any finding and watch the heart respond.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/app"
              className="btn-shimmer inline-flex min-h-12 items-center rounded-[10px] bg-primary px-6 font-cabin text-base font-medium text-white shadow-lg shadow-primary/30 transition-colors duration-200 hover:bg-primary-hover"
            >
              Start a risk assessment
            </Link>
            <Link
              href="/app?sample=multi_vessel"
              className="inline-flex min-h-12 items-center rounded-[10px] bg-plum px-6 font-cabin text-base font-medium text-[#f6f7f9] transition-colors duration-200 hover:bg-plum-hover"
            >
              Try a sample patient
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-12">
      <div className={`${container} flex flex-col gap-8 md:flex-row md:items-start md:justify-between`}>
        <div className="max-w-md space-y-3">
          <Logo />
          <p className="text-xs leading-relaxed text-white/50">
            Data: Extension of Z-Alizadeh Sani dataset, UCI Machine Learning Repository. Built for the Multimodal AI Hackathon
            2026, Track A. For decision support and educational purposes only.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-8 font-manrope text-sm text-white/70">
          <Link href="/app" className="transition-colors duration-200 hover:text-white">Open the app</Link>
          <a href="#results" className="transition-colors duration-200 hover:text-white">Results</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-white">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}

export function Landing() {
  usePageMeta(
    "CardioScope · See coronary risk in 3D and understand why",
    "CardioScope predicts coronary artery disease and LAD, LCX and RCA stenosis from routine clinical, ECG and echo data, colours each artery on an interactive 3D heart and explains every prediction.",
  );
  return (
    <div className="min-h-full overflow-x-hidden bg-ink text-white [scroll-behavior:smooth]">
      <a href="#main" className="sr-only z-[60] rounded bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <ScrollProgress />
      <Hero />
      <main id="main">
        <Showcase />
        <Stats />
        <section aria-label="Methods and tools" className="py-4">
          <div className={container}>
            <Marquee
              items={[
                "Nested cross-validation",
                "Bootstrap 95% CIs",
                "Platt calibration",
                "Logistic regression",
                "Random forest",
                "XGBoost",
                "CatBoost",
                "Exact SHAP",
                "FastAPI",
                "React Three Fiber",
                "Meshopt-compressed anatomy",
                "Live what-if",
              ]}
            />
          </div>
        </section>
        <HowItWorks />
        <Features />
        <Results />
        <Responsible />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
