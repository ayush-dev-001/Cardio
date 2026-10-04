/** Small motion building blocks for the landing page (all respect reduced-motion via MotionConfig). */
import { animate, motion, useInView, type HTMLMotionProps } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fade-and-rise when the element first scrolls into view. */
export function Reveal({ children, delay = 0, ...rest }: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to `value` once, when visible. */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 1.2, ease: "easeOut", onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** ECG trace drawn once across the hero: the page's single signature animation. */
export function EcgLine({ className = "" }: { className?: string }) {
  const beat = "l 60 0 l 10 -14 l 10 14 l 18 0 l 8 10 l 12 -58 l 12 70 l 9 -22 l 22 0 l 14 -10 l 14 10";
  const d = `M 0 60 ${beat} l 70 0 ${beat} l 70 0 ${beat} l 70 0 ${beat}`;
  return (
    <svg viewBox="0 0 1100 120" preserveAspectRatio="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="ecg-grad" x1="0" x2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
          <stop offset="25%" stopColor="#3b82f6" />
          <stop offset="75%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={d}
        fill="none"
        stroke="url(#ecg-grad)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2.4, ease: "easeInOut", delay: 0.3 }}
      />
    </svg>
  );
}
