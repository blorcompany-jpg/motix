"""Adattamento settimanale del piano (sezione 8.1: «il piano si adatta ogni settimana»).

Regole esplicite e verificabili, come prevede l'avvio senza dati (sezione 8.6). Per ogni esercizio
del piano il modulo guarda cosa è successo nella settimana appena finita (serie fatte, ripetizioni,
carichi, fatica dichiarata, dati del sensore) e decide se aumentare, confermare o ridurre.

Il modulo propone; il backend applica le proposte e il personal trainer può sempre cambiarle.
Le soglie vanno riviste dal team BTECH prima del lancio.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# Soglie del modulo.
HARD_WEEK_EFFORT = 9.0  # fatica media da cui scatta la settimana di scarico
EASY_EFFORT = 5.0  # fatica media sotto cui si sale più in fretta
LOW_ADHERENCE = 0.5  # quota di sedute fatte sotto cui il piano resta fermo
STEP_UP = 0.05  # aumento normale del carico
STEP_UP_EASY = 0.075  # aumento quando la settimana è stata facile
STEP_UP_CAREFUL = 0.025  # aumento prudente (minorenni, fatica alta)
STEP_DOWN = 0.05  # riduzione dopo due sedute sotto l'obiettivo
DELOAD = 0.10  # riduzione nella settimana di scarico
HIGH_VELOCITY_LOSS = 35.0  # calo di velocità (%) oltre cui la serie è al limite
MAX_REPS = 20
MAX_SECONDS = 90
MAX_MINUTES = 30


@dataclass
class SetDone:
    reps: int
    load_kg: float | None = None
    velocity_loss_pct: float | None = None


@dataclass
class ExerciseWeek:
    key: str
    name: str
    unit: str  # reps | seconds | minutes
    loadable: bool
    sets: int
    reps: int
    load_kg: float | None
    # Una lista di serie per ogni seduta della settimana in cui l'esercizio è stato fatto, dalla più vecchia.
    sessions: list[list[SetDone]] = field(default_factory=list)


@dataclass
class WeekInput:
    planned_sessions: int
    completed_sessions: int
    efforts: list[int]
    minor: bool
    exercises: list[ExerciseWeek]


@dataclass
class ExerciseDecision:
    key: str
    action: str  # increase | hold | decrease
    sets: int
    reps: int
    load_kg: float | None
    reason: str


@dataclass
class WeekDecision:
    mode: str  # progress | hold | deload
    summary: list[str]
    exercises: list[ExerciseDecision]


def _round_half(value: float) -> float:
    return math.floor(value * 2 + 0.5) / 2


def _kg(value: float) -> str:
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return text.replace(".", ",") + " kg"


def _sessions(done: int, planned: int) -> str:
    return f"{done} {'seduta' if done == 1 else 'sedute'} su {planned}"


def _hit_target(ex: ExerciseWeek, done: list[SetDone]) -> bool:
    return len(done) >= ex.sets and all(s.reps >= ex.reps for s in done[: ex.sets])


def _missed(ex: ExerciseWeek, done: list[SetDone]) -> bool:
    """Seduta chiaramente sotto l'obiettivo: serie mancanti o ripetizioni mancate in almeno due serie."""
    short = sum(1 for s in done if s.reps < ex.reps)
    return len(done) < ex.sets - 1 or short >= 2


def _top_load(done: list[SetDone]) -> float | None:
    loads = [s.load_kg for s in done if s.load_kg]
    return max(loads) if loads else None


def adapt_week(week: WeekInput) -> WeekDecision:
    effort = sum(week.efforts) / len(week.efforts) if week.efforts else None
    adherence = week.completed_sessions / week.planned_sessions if week.planned_sessions else 0.0
    summary: list[str] = []

    if week.completed_sessions == 0:
        mode = "hold"
        summary.append("La settimana scorsa non hai completato sedute: il piano riparte uguale, senza aumenti.")
    elif effort is not None and effort >= HARD_WEEK_EFFORT:
        mode = "deload"
        summary.append(
            "La settimana scorsa la fatica è stata molto alta: questa settimana i carichi scendono di circa il 10% per recuperare."
        )
    elif week.planned_sessions >= 2 and adherence < LOW_ADHERENCE:
        mode = "hold"
        summary.append(
            f"Hai completato {_sessions(week.completed_sessions, week.planned_sessions)}: il piano resta uguale. "
            "Se i giorni sono troppi, riducili nel questionario."
        )
    else:
        mode = "progress"
        summary.append(
            f"Hai completato {_sessions(week.completed_sessions, week.planned_sessions)}: dove hai chiuso tutte le ripetizioni il piano sale."
        )

    decisions = [_decide(ex, mode, effort, week.minor) for ex in week.exercises]
    up = sum(1 for d in decisions if d.action == "increase")
    down = sum(1 for d in decisions if d.action == "decrease")
    if mode == "progress":
        if up:
            summary.append(
                "Un esercizio sale di carico, ripetizioni o durata; gli altri restano uguali."
                if up == 1
                else f"{up} esercizi salgono di carico, ripetizioni o durata; gli altri restano uguali."
            )
        else:
            summary.append("Nessun aumento questa settimana: prima consolida le ripetizioni previste.")
        if down:
            summary.append(
                "Un esercizio scende leggermente, perché per due sedute non hai raggiunto l'obiettivo."
                if down == 1
                else f"{down} esercizi scendono leggermente, perché per due sedute non hai raggiunto l'obiettivo."
            )
    if week.minor and up:
        summary.append("Tra 14 e 17 anni gli aumenti di carico sono più piccoli.")
    return WeekDecision(mode=mode, summary=summary, exercises=decisions)


def _decide(ex: ExerciseWeek, mode: str, effort: float | None, minor: bool) -> ExerciseDecision:
    def hold(reason: str) -> ExerciseDecision:
        return ExerciseDecision(ex.key, "hold", ex.sets, ex.reps, ex.load_kg, reason)

    if mode == "deload":
        if ex.loadable and ex.load_kg:
            load = max(0.5, _round_half(ex.load_kg * (1 - DELOAD)))
            return ExerciseDecision(ex.key, "decrease", ex.sets, ex.reps, load, f"Settimana di scarico, da {_kg(ex.load_kg)} a {_kg(load)}.")
        if ex.unit == "reps" and ex.sets > 2:
            return ExerciseDecision(ex.key, "decrease", ex.sets - 1, ex.reps, ex.load_kg, "Settimana di scarico, una serie in meno.")
        return hold("Settimana di scarico, resta uguale.")
    if not ex.sessions:
        return hold("Non eseguito la settimana scorsa, resta uguale.")
    if mode == "hold":
        return hold("Resta uguale.")

    last = ex.sessions[-1]
    hit = _hit_target(ex, last)

    if ex.unit == "minutes":
        if hit and effort is not None and effort <= 6 and ex.reps < MAX_MINUTES:
            return ExerciseDecision(ex.key, "increase", ex.sets, ex.reps + 1, None, f"Da {ex.reps} a {ex.reps + 1} minuti.")
        return hold("Durata confermata.")
    if ex.unit == "seconds":
        if hit and ex.reps < MAX_SECONDS:
            reps = min(MAX_SECONDS, ex.reps + 5)
            return ExerciseDecision(ex.key, "increase", ex.sets, reps, None, f"Hai tenuto tutte le serie, da {ex.reps} a {reps} secondi.")
        return hold("Durata confermata.")

    losses = [s.velocity_loss_pct for s in last if s.velocity_loss_pct is not None]
    at_limit = bool(losses) and max(losses) > HIGH_VELOCITY_LOSS

    if ex.loadable:
        used = _top_load(last)
        if used is None:
            return hold("Registra il carico usato, serve per farlo salire.")
        base = ex.load_kg or used
        if hit:
            if at_limit:
                return ExerciseDecision(
                    ex.key, "hold", ex.sets, ex.reps, base,
                    "Ripetizioni completate, ma il sensore ha visto le ultime molto più lente. Carico confermato.",
                )
            if effort is not None and effort >= 8.5:
                return ExerciseDecision(ex.key, "hold", ex.sets, ex.reps, base, "Ripetizioni completate con fatica alta, carico confermato.")
            step = STEP_UP
            if minor or (effort is not None and effort >= 8):
                step = STEP_UP_CAREFUL
            elif effort is not None and effort <= EASY_EFFORT and not at_limit:
                step = STEP_UP_EASY
            # Si parte dal carico usato davvero, se più alto di quello previsto.
            start = max(base, used)
            load = max(start + 0.5, _round_half(start * (1 + step)))
            return ExerciseDecision(ex.key, "increase", ex.sets, ex.reps, load, f"Tutte le ripetizioni completate, da {_kg(start)} a {_kg(load)}.")
        if len(ex.sessions) >= 2 and all(_missed(ex, s) for s in ex.sessions[-2:]):
            load = max(0.5, _round_half(base * (1 - STEP_DOWN)))
            if load < base:
                return ExerciseDecision(
                    ex.key, "decrease", ex.sets, ex.reps, load,
                    f"Per due sedute sotto le ripetizioni previste, da {_kg(base)} a {_kg(load)}.",
                )
        return ExerciseDecision(ex.key, "hold", ex.sets, ex.reps, base, "Ripetizioni non ancora tutte completate, carico confermato.")

    # Corpo libero: prima salgono le ripetizioni.
    if hit and not at_limit and (effort is None or effort < 8.5):
        if ex.reps < MAX_REPS:
            return ExerciseDecision(ex.key, "increase", ex.sets, ex.reps + 1, None, f"Tutte le ripetizioni completate, da {ex.reps} a {ex.reps + 1}.")
        return hold("Sei al massimo delle ripetizioni, prova una variante più difficile dalla libreria.")
    return hold("Ripetizioni confermate.")
