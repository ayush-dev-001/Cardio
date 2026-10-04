import {
  Activity,
  ArrowRight,
  BarChart3,
  Box,
  ClipboardList,
  Cpu,
  Gauge,
  GitBranch,
  MapPinOff,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { Suspense, lazy, useState, type MouseEvent, type ReactNode } from "react";
import { Logo } from "../components/Logo";
import { Link } from "../router";
import { CountUp, EcgLine, Reveal } from "./motion";
import { METRICS } from "./metrics";

const HeroHeart = lazy(() => import("./HeroHeart"));

const GITHUB = "https://github.com/ayush-dev-001/cardioscope";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

function CtaButton({ children, href = "/app", className = "" }: { children: ReactNode; href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`group inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-cta px-5 py-2.5 text-sm font-semibold text-cta-ink shadow-lg shadow-amber-500/20 transition-colors duration-200 hover:bg-cta-hover ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function Nav() {
  const links = [
    ["How it works", "#how"],
    ["Features", "#features"],
    ["Validation", "#validation"],
    ["Responsible use", "#responsible"],
  ];
  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-2.5 shadow-xl shadow-black/20 backdrop-blur-md"
      >
        <Link href="/" aria-label="CardioScope home" className="inline-flex min-h-11 items-center rounded-lg">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-slate-300 transition-colors duration-200 hover:text-white">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            aria-label="Source code on GitHub"
            className="hidden min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 transition-colors duration-200 hover:border-slate-500 hover:text-white sm:inline-flex"
          >
            <GitBranch className="h-4 w-4" aria-hidden /> Source
          </a>
          <CtaButton className="min-h-10 px-3.5 py-2 sm:px-4">
            <span className="sm:hidden">Dashboard</span>
            <span className="hidden sm:inline">Open dashboard</span>
          </CtaButton>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-32">
      {/* soft brand glows (blue / amber, no purple per design system) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute -right-40 top-40 h-[460px] w-[460px] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>
      <div className={`${container} relative grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]`}>
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cta" aria-hidden />
            Multimodal AI Hackathon 2026 · Track A
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            See coronary risk, <span className="text-gradient">vessel by vessel.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
          >
            CardioScope turns {METRICS.features} routine clinical measurements into a calibrated probability of coronary artery
            disease and of stenosis in the LAD, LCX and RCA, maps it onto an interactive 3D heart, and explains every prediction.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <CtaButton>Open the dashboard</CtaButton>
            <a
              href="#how"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-700 px-5 text-sm font-semibold text-slate-200 transition-colors duration-200 hover:border-slate-500 hover:text-white"
            >
              How it works
            </a>
          </motion.div>
          <p className="mt-6 flex max-w-xl items-start gap-2 text-xs leading-relaxed text-slate-400">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            For decision support and education only. Not a diagnosis and not a substitute for formal diagnostic imaging such as
            coronary angiography.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="relative h-[380px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 sm:h-[460px]"
        >
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Loading 3D heart…</div>}>
            <HeroHeart />
          </Suspense>
        </motion.div>
      </div>
      <EcgLine className="pointer-events-none mx-auto mt-10 block h-16 w-full max-w-6xl opacity-80" />
    </section>
  );
}

function Stats() {
  const items = [
    { icon: Users, value: METRICS.patients, label: "patients in the Z-Alizadeh Sani extension dataset" },
    { icon: ClipboardList, value: METRICS.features, label: "clinical, ECG, lab and echo features" },
    { icon: Activity, value: METRICS.rows[0].auc.mean, decimals: 2, label: "ROC-AUC for overall CAD (nested CV)" },
    { icon: Cpu, value: METRICS.families, label: "model families compared per target" },
  ];
  return (
    <section aria-label="Key numbers" className="border-y border-slate-800/80 bg-slate-900/30">
      <div className={`${container} grid grid-cols-2 gap-6 py-10 lg:grid-cols-4`}>
        {items.map(({ icon: Icon, value, decimals, label }, i) => (
          <Reveal key={label} delay={i * 0.06} className="flex items-start gap-3">
            <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-400" aria-hidden />
            <div>
              <div className="text-3xl font-bold text-white">
                <CountUp value={value} decimals={decimals} />
              </div>
              <p className="mt-1 text-sm leading-snug text-slate-400">{label}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-slate-400">{children}</p>}
    </Reveal>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: ClipboardList,
      title: "Enter clinical data",
      text: "Demographics, history, examination, ECG, laboratory and echocardiography findings, or load a real example patient in one click.",
    },
    {
      icon: Activity,
      title: "Calibrated models predict",
      text: "Separate models estimate overall CAD and LAD, LCX and RCA stenosis. Each is the best of four families, calibrated, with thresholds tuned for sensitivity.",
    },
    {
      icon: Box,
      title: "See it and understand it",
      text: "Each artery on the 3D heart takes its risk colour. SHAP shows which findings pushed the risk up or down, against normal ranges.",
    },
  ];
  return (
    <section id="how" className="scroll-mt-24 py-24">
      <div className={container}>
        <SectionHeading eyebrow="How it works" title="From bedside data to a vessel-level picture" />
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <li className="h-full rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-slate-500">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Card with a soft spotlight that follows the cursor (colour/opacity only, no layout shift). */
function SpotlightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setPos(null)}
      className={`relative h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-colors duration-200 hover:border-slate-600 ${className}`}
    >
      {pos && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, rgba(59,130,246,0.10), transparent 70%)` }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

function Features() {
  const items = [
    {
      icon: Box,
      title: "3D vessel risk map",
      text: "A semi-transparent torso and heart with the LAD, LCX and RCA drawn along their real courses. Rotate, zoom and click a vessel to inspect it.",
      wide: true,
    },
    { icon: BarChart3, title: "Explainable by design", text: "An exact SHAP waterfall for every target: from the average patient to this patient, factor by factor." },
    { icon: Gauge, title: "Physiology at a glance", text: "Every measurement against its normal range, beside its contribution to the prediction." },
    { icon: SlidersHorizontal, title: "What-if exploration", text: "Move blood pressure, lipids or smoking status and watch probabilities and 3D colours update live." },
    {
      icon: ShieldCheck,
      title: "Validated, not just trained",
      text: `Nested cross-validation (${METRICS.outerFolds} folds × ${METRICS.repeats} repeats), ${METRICS.bootstrap.toLocaleString()} bootstrap resamples for 95% CIs, calibrated probabilities.`,
      wide: true,
    },
    { icon: Cpu, title: "Runs on any laptop", text: "No GPU needed: on-demand 3D rendering and predictions in well under a second." },
  ];
  return (
    <section id="features" className="scroll-mt-24 border-t border-slate-800/60 py-24">
      <div className={container}>
        <SectionHeading eyebrow="Features" title="Built for clinicians who want to see the reasoning">
          Predictions, anatomy and explanations live on one screen and update together.
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {items.map(({ icon: Icon, title, text, wide }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.06} className={wide ? "md:col-span-2" : ""}>
              <SpotlightCard>
                <Icon className="h-6 w-6 text-brand-400" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{text}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Validation() {
  return (
    <section id="validation" className="scroll-mt-24 border-t border-slate-800/60 py-24">
      <div className={container}>
        <SectionHeading eyebrow="Validation" title="Honest numbers, including where it is weaker">
          Estimated with repeated nested cross-validation on {METRICS.patients} patients; 95% bootstrap confidence intervals.
          Overall CAD and LAD are predicted well; LCX and RCA only moderately, because routine clinical data carries little
          vessel-specific signal.
        </SectionHeading>
        <Reveal>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Cross-validated performance per prediction target</caption>
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Target</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Selected model</th>
                  <th scope="col" className="px-5 py-3 font-semibold">ROC-AUC (95% CI)</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Sensitivity</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Specificity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {METRICS.rows.map((r) => (
                  <tr key={r.id} className="bg-slate-950/40">
                    <th scope="row" className="px-5 py-3.5 font-semibold text-white">{r.label}</th>
                    <td className="px-5 py-3.5 text-slate-300">{r.model}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-10 font-semibold tabular-nums text-white">{r.auc.mean.toFixed(2)}</span>
                        <div className="relative hidden h-1.5 w-28 rounded-full bg-slate-800 sm:block" aria-hidden>
                          <div
                            className="absolute inset-y-0 rounded-full bg-brand-500/50"
                            style={{ left: `${(r.auc.ci_low - 0.5) * 200}%`, right: `${100 - (r.auc.ci_high - 0.5) * 200}%` }}
                          />
                          <div className="absolute -top-0.5 h-2.5 w-1 rounded bg-brand-300" style={{ left: `${(r.auc.mean - 0.5) * 200}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">
                          {r.auc.ci_low.toFixed(2)}–{r.auc.ci_high.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-slate-300">{pct(r.sensitivity.mean)}</td>
                    <td className="px-5 py-3.5 tabular-nums text-slate-300">{pct(r.specificity.mean)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            AUC bar spans 0.5 (chance) to 1.0. Decision thresholds favour sensitivity (≥{pct(METRICS.rows[0].minRecall)} for CAD,
            ≥{pct(METRICS.rows[1].minRecall)} per vessel), so specificity is lower by design.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Responsible() {
  const points = [
    {
      icon: ShieldAlert,
      title: "Decision support only",
      text: "CardioScope does not diagnose. Predictions are not a substitute for coronary angiography or other formal imaging.",
    },
    {
      icon: MapPinOff,
      title: "Per-vessel, not per-lesion",
      text: "Each artery is coloured by its predicted stenosis probability. The view does not show where a lesion sits within a vessel.",
    },
    {
      icon: Users,
      title: "Small, single-centre data",
      text: `Trained on ${METRICS.patients} patients from one centre, with no external validation yet. Treat outputs as a research prototype.`,
    },
  ];
  return (
    <section id="responsible" className="scroll-mt-24 border-t border-slate-800/60 py-24">
      <div className={container}>
        <SectionHeading eyebrow="Responsible use" title="Clear about what it is, and what it is not" />
        <div className="grid gap-5 md:grid-cols-3">
          {points.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-6">
                <Icon className="h-6 w-6 text-amber-300" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
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
        <Reveal className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-900 px-6 py-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Try it with a real example patient</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Load a normal, single-vessel or multi-vessel case from the dataset, then change any finding and watch the heart respond.
          </p>
          <CtaButton className="mt-8">Open the dashboard</CtaButton>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800/80 py-10">
      <div className={`${container} flex flex-col gap-6 text-sm text-slate-400 md:flex-row md:items-start md:justify-between`}>
        <div className="max-w-md space-y-2">
          <Logo />
          <p className="text-xs leading-relaxed">
            Data: Extension of Z-Alizadeh Sani dataset, UCI Machine Learning Repository. Built for the Multimodal AI Hackathon
            2026, Track A. For decision support and educational purposes only.
          </p>
        </div>
        <div className="flex gap-6">
          <Link href="/app" className="transition-colors duration-200 hover:text-white">
            Dashboard
          </Link>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="transition-colors duration-200 hover:text-white">
            GitHub
          </a>
          <a href="#validation" className="transition-colors duration-200 hover:text-white">
            Validation
          </a>
        </div>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="min-h-full overflow-x-hidden bg-slate-950 text-slate-200 [scroll-behavior:smooth]">
      <a
        href="#main"
        className="sr-only z-[60] rounded bg-cta px-3 py-2 text-cta-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Stats />
        <HowItWorks />
        <Features />
        <Validation />
        <Responsible />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
