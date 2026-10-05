import { ChevronDown, Menu, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../components/Logo";
import { Link } from "../router";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260210_031346_d87182fb-b0af-4273-84d1-c6fd17d6bf0f.mp4";
export const GITHUB_URL = "https://github.com/ayush-dev-001/cardioscope";

const FEATURE_LINKS = [
  { label: "Interactive 3D heart", href: "#showcase", text: "Each artery coloured by its stenosis probability" },
  { label: "Explainable predictions", href: "#features", text: "SHAP waterfall and physiology panel" },
  { label: "What-if exploration", href: "#features", text: "Move risk factors, watch the heart respond" },
  { label: "Validation", href: "#results", text: "Nested cross-validation with confidence intervals" },
];

const NAV = [
  { label: "Home", href: "/" },
  { label: "Features", href: "#features", dropdown: true },
  { label: "How it works", href: "#how" },
  { label: "Results", href: "#results" },
];

function FeaturesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-1 font-manrope text-sm font-medium text-white transition-opacity duration-200 hover:opacity-80"
      >
        Features <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute left-1/2 top-full z-30 mt-1 w-72 -translate-x-1/2 rounded-xl p-2 shadow-2xl shadow-black/40"
          >
            {FEATURE_LINKS.map((f) => (
              <a
                key={f.label}
                href={f.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-white/[0.06]"
              >
                <span className="block font-manrope text-sm font-semibold text-white">{f.label}</span>
                <span className="block text-xs text-white/60">{f.text}</span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const items = [...NAV.filter((n) => !n.dropdown), ...FEATURE_LINKS.slice(0, 3).map((f) => ({ label: f.label, href: f.href }))];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-black px-6 py-4"
        >
          <div className="flex items-center justify-between">
            <Logo />
            <button type="button" onClick={onClose} aria-label="Close menu" className="grid h-11 w-11 place-items-center text-white">
              <X className="h-6 w-6" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobile" className="mt-10 flex flex-col gap-1">
            {items.map((n, i) => (
              <motion.a
                key={n.label}
                href={n.href}
                onClick={onClose}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.25 }}
                className="py-3 font-serif text-4xl text-white"
              >
                {n.label}
              </motion.a>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-3 pb-6">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center rounded-lg border border-[#d4d4d4] bg-white font-manrope text-sm font-semibold text-[#171717]"
            >
              View on GitHub
            </a>
            <Link
              href="/app"
              onClick={onClose}
              className="flex min-h-12 items-center justify-center rounded-lg bg-primary font-manrope text-sm font-semibold text-[#fafafa]"
            >
              Open the app
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-20 w-full px-6 py-4 lg:px-[120px]">
      <nav aria-label="Main" className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-12">
          <Link href="/" aria-label="CardioScope home" className="inline-flex min-h-11 items-center rounded-lg">
            <Logo />
          </Link>
          <ul className="hidden items-center gap-8 lg:flex">
            {NAV.map((n) => (
              <li key={n.label}>
                {n.dropdown ? (
                  <FeaturesDropdown />
                ) : n.href.startsWith("#") ? (
                  <a href={n.href} className="flex min-h-11 items-center font-manrope text-sm font-medium text-white transition-opacity duration-200 hover:opacity-80">
                    {n.label}
                  </a>
                ) : (
                  <Link href={n.href} className="flex min-h-11 items-center font-manrope text-sm font-medium text-white transition-opacity duration-200 hover:opacity-80">
                    {n.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center rounded-lg border border-[#d4d4d4] bg-white px-4 font-manrope text-sm font-semibold text-[#171717] transition-colors duration-200 hover:bg-neutral-100"
          >
            View on GitHub
          </a>
          <Link
            href="/app"
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 font-manrope text-sm font-semibold text-[#fafafa] shadow-md shadow-primary/30 transition-colors duration-200 hover:bg-primary-hover"
          >
            Open the app
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="grid h-11 w-11 place-items-center text-white lg:hidden"
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
      </nav>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 22, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative isolate flex min-h-screen flex-col overflow-hidden bg-ink">
      <video
        className="absolute inset-0 -z-10 h-full w-full object-cover"
        src={VIDEO_URL}
        autoPlay={!reduce}
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
      />
      {/* only a fade at the bottom edge so the hero blends into the next section; the video itself stays opaque */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-ink" />

      <Navbar />

      <div className="relative z-10 mx-auto mt-32 flex w-full max-w-5xl flex-col items-center px-6 pb-24 text-center">
        <motion.div
          {...rise(0.1)}
          className="flex h-[38px] items-center gap-2.5 rounded-[10px] border border-[rgba(164,132,215,0.5)] bg-[rgba(85,80,110,0.4)] pl-1.5 pr-3.5 font-cabin text-sm font-medium text-white backdrop-blur-md"
        >
          <span className="rounded-[6px] bg-primary px-2 py-0.5">New</span>
          Stenosis prediction for LAD, LCX and RCA
        </motion.div>

        <motion.h1 {...rise(0.22)} className="mt-7 font-serif text-5xl leading-[1.1] text-white sm:text-7xl lg:text-[96px]">
          See coronary risk in 3D <em className="mx-[0.08em] italic">and</em> understand why
        </motion.h1>

        <motion.p {...rise(0.34)} className="mt-6 max-w-[662px] text-lg font-normal leading-relaxed text-white/70">
          CardioScope predicts coronary artery disease from routine clinical, ECG and echo data, colors each coronary artery on an
          interactive 3D heart, and shows which measurements drove every result.
        </motion.p>

        <motion.div {...rise(0.46)} className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/app"
            className="btn-shimmer inline-flex min-h-12 items-center justify-center rounded-[10px] bg-primary px-6 font-cabin text-base font-medium text-white shadow-lg shadow-primary/30 transition-colors duration-200 hover:bg-primary-hover"
          >
            Start a risk assessment
          </Link>
          <Link
            href="/app?sample=multi_vessel"
            className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-plum px-6 font-cabin text-base font-medium text-[#f6f7f9] transition-colors duration-200 hover:bg-plum-hover"
          >
            Try a sample patient
          </Link>
        </motion.div>

        <motion.p {...rise(0.58)} className="mt-8 max-w-[560px] text-[13px] leading-relaxed text-white/60">
          For decision support and educational use only. Not a substitute for formal diagnostic imaging.
        </motion.p>
      </div>
    </section>
  );
}
