import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { riskColor } from "../anatomy/riskColor";
import { HeartViewer } from "../scene/HeartViewer";

/** Illustrative scenarios for the hero animation (not model output, and labelled as such). */
const SCENES = [
  { title: "Normal coronaries", values: { LAD: 0.08, LCX: 0.12, RCA: 0.1 } },
  { title: "Single-vessel disease", values: { LAD: 0.86, LCX: 0.22, RCA: 0.18 } },
  { title: "Multi-vessel disease", values: { LAD: 0.91, LCX: 0.74, RCA: 0.82 } },
];

/** Live 3D heart that cycles through the scenarios while visible (rotate with drag). */
export default function HeroHeart() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [i, setI] = useState(1);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setI((x) => (x + 1) % SCENES.length), 3600);
    return () => clearInterval(t);
  }, [inView]);
  const scene = SCENES[i];

  return (
    <div ref={ref} className="relative h-full w-full">
      <HeartViewer probabilities={scene.values} selectedId={null} onSelect={() => {}} transparent zoom={false} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={scene.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 rounded-full border border-slate-700/80 bg-slate-950/80 px-4 py-1.5 text-xs text-slate-300 backdrop-blur"
          >
            <span className="font-semibold text-white">{scene.title}</span>
            {Object.entries(scene.values).map(([v, p]) => (
              <span key={v} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: riskColor(p) }} aria-hidden />
                {v} {Math.round(p * 100)}%
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="absolute right-3 top-3 rounded bg-slate-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
        Illustrative demo values
      </p>
    </div>
  );
}
