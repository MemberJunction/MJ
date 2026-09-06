"""Pydantic mirrors of the TypeScript forecast contract.

Field names are PascalCase to match `Core/src/sidecar-contract.ts` verbatim — the wire format is
the contract, and a silent camelCase drift here would be an integration bug nobody sees until a
value arrives as None.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from .forecaster import MIN_CONTEXT


class ForecastSeries(BaseModel):
    Key: str
    Context: List[float]


class ForecastRequest(BaseModel):
    Series: List[ForecastSeries]
    Horizon: int = Field(..., ge=1)
    Checkpoint: Optional[str] = None
    MinContext: int = MIN_CONTEXT


class ForecastResult(BaseModel):
    Key: str
    Median: Optional[List[float]] = None
    Quantiles: Optional[List[List[float]]] = None
    Refused: Optional[str] = None


class ForecastResponse(BaseModel):
    Results: List[ForecastResult]
    Checkpoint: str
    ProductionLicensed: bool
    DurationMs: int


class ForecastHealthResponse(BaseModel):
    Status: str = "ok"
    AvailableCheckpoints: List[str] = []
    ModelAvailable: bool = False
    Unavailable: Optional[str] = None
