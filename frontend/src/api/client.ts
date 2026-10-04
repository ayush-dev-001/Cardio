import type { ExplainResponse, Patient, PredictResponse, SamplePatient, Schema } from "./types";

/** Backend base URL; set VITE_API_URL at build time for deployments. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(`Cannot reach the CardioScope API at ${API_URL}.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(-1)[0] ?? ""}: ${d.msg}`).join("; ")
      : body?.detail;
    throw new ApiError(detail ? `API error ${res.status}: ${detail}` : `API error ${res.status}`, res.status, body);
  }
  return res.json() as Promise<T>;
}

export const api = {
  schema: () => request<Schema>("/schema"),
  samples: () => request<SamplePatient[]>("/patients/sample"),
  predict: (patient: Patient, signal?: AbortSignal) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify({ patient }), signal }),
  explain: (patient: Patient, signal?: AbortSignal) =>
    request<ExplainResponse>("/explain", { method: "POST", body: JSON.stringify({ patient }), signal }),
};
