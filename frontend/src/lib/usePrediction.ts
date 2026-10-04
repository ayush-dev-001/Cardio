import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ExplainResponse, Patient, PredictResponse } from "../api/types";

export interface PredictionState {
  prediction: PredictResponse | null;
  explanation: ExplainResponse | null;
  busy: boolean;
  error: string | null;
  latencyMs: number | null; // last round trip (predict + explain in parallel)
  submittedKey: string | null; // JSON of the patient behind the current results
}

/**
 * Live predictions: whenever `patient` changes (and `live` is on) a request is sent after a
 * short debounce. Older in-flight requests are aborted and a sequence number guarantees that a
 * slow, stale response can never overwrite a newer one.
 */
export function usePrediction(patient: Patient | null, live: boolean, debounceMs = 200) {
  const [state, setState] = useState<PredictionState>({
    prediction: null, explanation: null, busy: false, error: null, latencyMs: null, submittedKey: null,
  });
  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async (p: Patient) => {
    const id = ++seq.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState((s) => ({ ...s, busy: true }));
    const t0 = performance.now();
    try {
      const [prediction, explanation] = await Promise.all([api.predict(p, ctrl.signal), api.explain(p, ctrl.signal)]);
      if (id !== seq.current) return; // a newer request superseded this one
      setState({
        prediction, explanation, busy: false, error: null,
        latencyMs: Math.round(performance.now() - t0), submittedKey: JSON.stringify(p),
      });
    } catch (e) {
      if (id !== seq.current || (e instanceof DOMException && e.name === "AbortError")) return;
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  const key = patient ? JSON.stringify(patient) : null;
  useEffect(() => {
    if (!live || !patient || key === state.submittedKey) return;
    const t = setTimeout(() => run(patient), debounceMs);
    return () => clearTimeout(t);
    // patient is represented by `key`
  }, [key, live, debounceMs, run]);

  useEffect(() => () => controller.current?.abort(), []);

  return { ...state, run, dirty: key !== null && key !== state.submittedKey };
}
