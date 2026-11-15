"""Motore AI di MOTIX (sezione 8 del documento di progetto).

Moduli presenti:

- analisi dell'esecuzione dai dati del sensore motix pod (`execution.py`);
- adattamento settimanale del piano (`adaptation.py`).

Entrambi sono a regole esplicite, come previsto per l'avvio senza dati. I modelli addestrati
(ordinamento con LightGBM, utenti simili) entrano qui quando i dati del pilot sono sufficienti.

Il backend Node.js è l'unico a chiamare questo servizio: app e sito non lo raggiungono direttamente.
Se è impostata la variabile AI_SERVICE_KEY, ogni richiesta deve portarla nell'intestazione X-Motix-Key.
"""

from __future__ import annotations

import hmac
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

from .adaptation import ExerciseWeek, SetDone, WeekInput, adapt_week
from .execution import analyze_set

app = FastAPI(title="MOTIX AI", version="1.0.0")

MAX_SAMPLES = 60_000  # dieci minuti a 100 Hz


def require_key(x_motix_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("AI_SERVICE_KEY")
    if expected and not hmac.compare_digest(x_motix_key or "", expected):
        raise HTTPException(status_code=401, detail="Chiave del servizio mancante o non valida")


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "motix-ai", "version": app.version}


class SetSignal(BaseModel):
    """Accelerazione sui tre assi in m/s², gravità compresa."""

    sampleRateHz: float = Field(ge=20, le=200)
    ax: list[float] = Field(max_length=MAX_SAMPLES)
    ay: list[float] = Field(max_length=MAX_SAMPLES)
    az: list[float] = Field(max_length=MAX_SAMPLES)

    @model_validator(mode="after")
    def same_length(self) -> "SetSignal":
        if not (len(self.ax) == len(self.ay) == len(self.az)):
            raise ValueError("I tre assi devono avere lo stesso numero di campioni")
        if any(abs(v) > 160 for axis in (self.ax, self.ay, self.az) for v in axis):
            raise ValueError("Accelerazioni fuori scala: i valori vanno in m/s²")
        return self


class RepOut(BaseModel):
    startMs: int
    durationMs: int
    rangeM: float
    velocity: float
    peakVelocity: float


class SetAnalysisOut(BaseModel):
    reps: int
    quality: Literal["ok", "too_short", "no_movement"]
    avgVelocity: float | None
    peakVelocity: float | None
    regularity: float | None
    timeUnderTensionMs: int | None
    velocityLossPct: float | None
    rangeM: float | None
    perRep: list[RepOut]


@app.post("/v1/execution/set", dependencies=[Depends(require_key)])
def execution_set(body: SetSignal) -> SetAnalysisOut:
    result = analyze_set(body.ax, body.ay, body.az, body.sampleRateHz)
    return SetAnalysisOut(
        reps=result.reps,
        quality=result.quality,  # type: ignore[arg-type]
        avgVelocity=result.avg_velocity,
        peakVelocity=result.peak_velocity,
        regularity=result.regularity,
        timeUnderTensionMs=result.time_under_tension_ms,
        velocityLossPct=result.velocity_loss_pct,
        rangeM=result.range_m,
        perRep=[
            RepOut(startMs=r.start_ms, durationMs=r.duration_ms, rangeM=r.range_m, velocity=float(r.velocity), peakVelocity=float(r.peak_velocity))
            for r in result.per_rep
        ],
    )


class SetDoneIn(BaseModel):
    reps: int = Field(ge=0, le=500)
    loadKg: float | None = Field(default=None, ge=0, le=500)
    velocityLossPct: float | None = Field(default=None, ge=0, le=100)


class ExerciseWeekIn(BaseModel):
    key: str = Field(max_length=80)
    name: str = Field(max_length=120)
    unit: Literal["reps", "seconds", "minutes"]
    loadable: bool
    sets: int = Field(ge=1, le=20)
    reps: int = Field(ge=1, le=500)
    loadKg: float | None = Field(default=None, ge=0, le=500)
    sessions: list[list[SetDoneIn]] = Field(default_factory=list, max_length=14)


class WeekIn(BaseModel):
    plannedSessions: int = Field(ge=0, le=14)
    completedSessions: int = Field(ge=0, le=14)
    efforts: list[int] = Field(default_factory=list, max_length=14)
    minor: bool = False
    exercises: list[ExerciseWeekIn] = Field(max_length=120)


class ExerciseDecisionOut(BaseModel):
    key: str
    action: Literal["increase", "hold", "decrease"]
    sets: int
    reps: int
    loadKg: float | None
    reason: str


class WeekOut(BaseModel):
    mode: Literal["progress", "hold", "deload"]
    summary: list[str]
    exercises: list[ExerciseDecisionOut]


@app.post("/v1/plan/adapt-week", dependencies=[Depends(require_key)])
def plan_adapt_week(body: WeekIn) -> WeekOut:
    decision = adapt_week(
        WeekInput(
            planned_sessions=body.plannedSessions,
            completed_sessions=body.completedSessions,
            efforts=body.efforts,
            minor=body.minor,
            exercises=[
                ExerciseWeek(
                    key=e.key,
                    name=e.name,
                    unit=e.unit,
                    loadable=e.loadable,
                    sets=e.sets,
                    reps=e.reps,
                    load_kg=e.loadKg,
                    sessions=[[SetDone(s.reps, s.loadKg, s.velocityLossPct) for s in session] for session in e.sessions],
                )
                for e in body.exercises
            ],
        )
    )
    return WeekOut(
        mode=decision.mode,  # type: ignore[arg-type]
        summary=decision.summary,
        exercises=[
            ExerciseDecisionOut(key=d.key, action=d.action, sets=d.sets, reps=d.reps, loadKg=d.load_kg, reason=d.reason)  # type: ignore[arg-type]
            for d in decision.exercises
        ],
    )

