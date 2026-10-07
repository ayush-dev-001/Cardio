"""CardioScope API.

Run locally (from the repository root):
    uvicorn app.main:app --app-dir backend --reload
Interactive docs: http://localhost:8000/docs
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    ExplainRequest,
    ExplainResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
    SamplePatient,
)
from app.service import ModelService
from app.settings import DISCLAIMER, Settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    app.state.service = ModelService(settings.models_dir)  # load models once
    yield


settings = Settings()
app = FastAPI(
    title="CardioScope API",
    version="1.0.0",
    description="Coronary artery disease and per-vessel (LAD/LCX/RCA) stenosis prediction with SHAP explanations.\n\n"
    + DISCLAIMER,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def service(request: Request) -> ModelService:
    svc = getattr(request.app.state, "service", None)
    if svc is None:
        raise HTTPException(status_code=503, detail="Models are not loaded")
    return svc


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(request: Request) -> dict[str, Any]:
    return service(request).health()


@app.get("/schema", tags=["meta"], summary="Input form definition, targets, vessels and model info")
def schema(request: Request) -> dict[str, Any]:
    return service(request).schema()


@app.post(
    "/predict",
    response_model=PredictResponse,
    tags=["model"],
    summary="Overall CAD status and per-vessel stenosis probabilities",
)
def predict(body: PredictRequest, request: Request) -> dict[str, Any]:
    return service(request).predict(body.patient.model_dump())


@app.post(
    "/explain",
    response_model=ExplainResponse,
    tags=["model"],
    summary="SHAP feature contributions per target",
)
def explain(body: ExplainRequest, request: Request) -> dict[str, Any]:
    return service(request).explain(body.patient.model_dump(), body.targets, body.top_k)


@app.get(
    "/patients/sample",
    response_model=list[SamplePatient],
    tags=["data"],
    summary="Real example patients: normal, single-vessel and multi-vessel disease",
)
def sample_patients(
    request: Request, kind: str | None = Query(default=None, description="Filter by kind")
) -> list[dict]:
    samples = service(request).samples
    if kind is not None:
        samples = [s for s in samples if s["kind"] == kind]
        if not samples:
            raise HTTPException(status_code=404, detail=f"Unknown sample kind {kind!r}")
    return samples
