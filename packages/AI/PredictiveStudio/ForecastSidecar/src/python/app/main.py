"""Predictive Studio FORECAST sidecar — FastAPI service.

The server side of the forecast contract in
``packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts``. Deliberately separate from the
tabular sidecar: this one carries torch and needs Python >=3.10.

Endpoints:
  * ``GET  /health``   — liveness, whether the model is loadable, which checkpoints are staged
  * ``POST /forecast`` — quantile forecast for a batch of series

There is no ``/train``. TimesFM is zero-shot: MJ CALLS it, it does not learn from client data.
(LoRA fine-tuning of the 2.5 checkpoint would add one — that is a later, separate decision.)
"""
from __future__ import annotations

import time

from fastapi import FastAPI, HTTPException

from . import forecaster
from .schemas import (
    ForecastHealthResponse,
    ForecastRequest,
    ForecastResponse,
    ForecastResult,
)

app = FastAPI(title="Predictive Studio Forecast Sidecar", version="1.0.0")


@app.get("/health", response_model=ForecastHealthResponse)
def health() -> ForecastHealthResponse:
    """Liveness plus an honest statement of whether this process can actually forecast.

    Reports `ModelAvailable: false` rather than failing to boot when timesfm is missing, so a
    caller can degrade deliberately instead of discovering the gap mid-assembly.
    """
    return ForecastHealthResponse(
        Status="ok",
        AvailableCheckpoints=forecaster.available_checkpoints(),
        ModelAvailable=forecaster.model_available(),
        Unavailable=forecaster.unavailable_reason(),
    )


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> ForecastResponse:
    """Forecast a batch of series.

    A series the model should not be asked about (too short, constant, non-finite) comes back with
    `Refused` set and null values — never an imputed band. The caller decides what a refusal means
    for its feature; inventing a number here would launder missing history into a confident one.
    """
    checkpoint = req.Checkpoint or forecaster.DEFAULT_CHECKPOINT
    started = time.time()
    try:
        results, licensed = forecaster.forecast_batch(
            [(s.Key, s.Context) for s in req.Series],
            horizon=req.Horizon,
            checkpoint=checkpoint,
            min_context=req.MinContext,
        )
    except forecaster.ForecastUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"forecast failed: {exc}") from exc

    return ForecastResponse(
        Results=[ForecastResult(**r) for r in results],
        Checkpoint=checkpoint,
        ProductionLicensed=licensed,
        DurationMs=int((time.time() - started) * 1000),
    )
