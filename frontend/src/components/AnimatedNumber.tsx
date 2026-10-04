import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Tweens from the previous value to the new one (e.g. a probability during live updates). */
export function AnimatedNumber({ value, format, duration = 0.45 }: { value: number; format: (v: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <>{format(shown)}</>;
}
