import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { motion } from "motion/react";
import { HeartMark } from "./components/Logo";
import { usePageMeta } from "./lib/meta";
import { Link } from "./router";

/** 404: animated flat-lining ECG that recovers into a beat, with routes back into the app. */
export function NotFound() {
  usePageMeta("Page not found · CardioScope", "The page you were looking for does not exist. Go back to CardioScope or open the clinical dashboard.");
  return (
    <main className="relative isolate flex min-h-full flex-col items-center justify-center overflow-hidden bg-ink px-6 py-16 text-center text-white">
      <div aria-hidden className="absolute left-1/2 top-1/3 -z-10 h-[420px] w-[620px] max-w-full -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <Link href="/" aria-label="CardioScope home" className="mb-10 inline-flex items-center gap-2 rounded-lg">
        <HeartMark size={34} />
        <span className="font-manrope text-lg font-bold">CardioScope</span>
      </Link>
      <svg viewBox="0 0 600 120" className="w-full max-w-xl" aria-hidden>
        <motion.path
          d="M0 60 H230 L250 60 L262 30 L276 92 L290 14 L304 104 L318 60 H600"
          fill="none"
          stroke="#7b39fc"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }}
        />
      </svg>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-6 font-cabin text-sm uppercase tracking-[0.2em] text-primary-soft">
        Error 404
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mt-3 font-serif text-5xl leading-[1.05] sm:text-7xl"
      >
        No pulse on <em className="italic text-brand-300">this</em> page
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-5 max-w-md text-white/65">
        The link may be broken or the page may have moved. Head back home or go straight to the dashboard.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
      >
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-plum px-6 font-cabin font-medium text-[#f6f7f9] transition-colors hover:bg-plum-hover"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
        </Link>
        <Link
          href="/app"
          className="btn-shimmer inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-primary px-6 font-cabin font-medium text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-hover"
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden /> Open the dashboard
        </Link>
      </motion.div>
    </main>
  );
}
