"""Analisi dell'esecuzione di una serie dai dati del sensore motix pod (sezione 8.2).

Dall'accelerazione sui tre assi ricava: ripetizioni, durata e velocità di ogni ripetizione,
regolarità del movimento, tempo sotto tensione e calo di velocità nella serie.

Come funziona, in breve:

1. toglie la gravità e trova la direzione lungo cui si muove il sensore (asse principale);
2. integra l'accelerazione per ottenere la velocità, eliminando la deriva con un filtro;
3. divide il segnale in fasi di andata e di ritorno (dove la velocità cambia verso) e scarta quelle
   troppo piccole per essere un movimento;
4. ogni andata seguita dal suo ritorno è una ripetizione.

Limiti da conoscere: la velocità è affidabile quando il sensore trasla senza ruotare (macchinari
guidati, pacco pesi, bilanciere). Su attrezzi che ruotano molto il conteggio resta buono, la
velocità è indicativa. Le soglie vanno tarate con i dati veri del pod durante il pilot.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import signal

# Soglie del modulo: riunite qui perché vanno tarate sui dati reali.
MIN_SECONDS = 1.5  # sotto questa durata non si analizza
HIGHPASS_HZ = 0.08  # elimina la deriva dell'integrazione senza tagliare le ripetizioni lente
LOWPASS_HZ = 8.0  # elimina vibrazioni e urti
MIN_RANGE_M = 0.04  # spostamento minimo perché sia un movimento e non rumore
MIN_PEAK_VELOCITY = 0.06  # m/s: sotto questa velocità è rumore
MIN_PHASE_SECONDS = 0.25  # una fase più breve di così è un urto, non un movimento
GATE_LOWPASS_HZ = 3.0  # banda in cui si confronta il movimento con il rumore
MIN_ACCEL_SWING = 0.2  # m/s²: escursione minima dell'accelerazione in una fase vera
NOISE_FACTOR = 8.0  # la fase deve superare di tanto il rumore di fondo
STILL_SHARE = 0.1  # sotto questa quota della velocità di punta il sensore è considerato fermo
SMALL_PHASE_SHARE = 0.35  # una fase conta se copre almeno questa quota dello spostamento tipico
SLOW_PHASE_SHARE = 0.2  # ...e se non è molto più lenta delle altre
EDGE_SECONDS = 0.1  # margine all'inizio e alla fine della registrazione


@dataclass
class Rep:
    start_ms: int
    duration_ms: int
    range_m: float
    velocity: float  # velocità media della fase di andata, m/s
    peak_velocity: float  # velocità massima nella ripetizione, m/s


@dataclass
class SetAnalysis:
    reps: int
    quality: str  # ok | too_short | no_movement
    avg_velocity: float | None = None
    peak_velocity: float | None = None
    regularity: float | None = None  # 0-100
    time_under_tension_ms: int | None = None
    velocity_loss_pct: float | None = None
    range_m: float | None = None
    per_rep: list[Rep] = field(default_factory=list)


def _filter(x: np.ndarray, fs: float, kind: str, hz: float) -> np.ndarray:
    nyquist = fs / 2
    sos = signal.butter(2, min(hz / nyquist, 0.99), btype=kind, output="sos")
    return signal.sosfiltfilt(sos, x)


def _integrate(x: np.ndarray, fs: float) -> np.ndarray:
    out = np.concatenate([[0.0], np.cumsum((x[1:] + x[:-1]) / 2) / fs])
    return _filter(out, fs, "highpass", HIGHPASS_HZ)


def analyze_set(ax: list[float], ay: list[float], az: list[float], sample_rate_hz: float) -> SetAnalysis:
    """Accelerazioni in m/s² (gravità compresa), campionate a `sample_rate_hz`."""
    fs = float(sample_rate_hz)
    a = np.column_stack([ax, ay, az]).astype(float)
    if len(a) < MIN_SECONDS * fs:
        return SetAnalysis(reps=0, quality="too_short")

    # Gravità e asse del movimento.
    dyn = a - np.median(a, axis=0)
    _, vectors = np.linalg.eigh(np.cov(dyn.T))
    along_raw = dyn @ vectors[:, -1]
    along = _filter(_filter(along_raw, fs, "highpass", HIGHPASS_HZ), fs, "lowpass", min(LOWPASS_HZ, fs / 2.5))
    velocity = _integrate(along, fs)

    # Soglia di accelerazione: la deriva dell'integrazione crea «movimenti» lenti senza accelerazione vera,
    # che si riconoscono confrontandoli con il rumore di fondo del sensore.
    smooth = _filter(along, fs, "lowpass", min(GATE_LOWPASS_HZ, fs / 2.5))
    # Il rumore si stima alle alte frequenze, dove il movimento del corpo non arriva.
    hiss = _filter(along_raw, fs, "highpass", fs / 4)
    noise = 1.4826 * float(np.median(np.abs(hiss - np.median(hiss)))) * np.sqrt(2)
    noise_in_band = noise * np.sqrt(min(GATE_LOWPASS_HZ, fs / 2.5) / (fs / 2))
    gate = max(MIN_ACCEL_SWING, NOISE_FACTOR * noise_in_band)

    # Fasi del movimento: tratti in cui la velocità mantiene lo stesso verso (andata o ritorno).
    sign = np.sign(velocity)
    sign[sign == 0] = 1
    edges = np.concatenate([[0], np.where(np.diff(sign) != 0)[0] + 1, [len(velocity)]])
    phases = []
    margin = int(EDGE_SECONDS * fs)
    for b0, b1 in zip(edges[:-1], edges[1:]):
        travel = float(np.sum(velocity[b0:b1]) / fs)
        peak = float(np.max(np.abs(velocity[b0:b1])))
        swing = float(np.ptp(smooth[b0:b1]))
        if abs(travel) < MIN_RANGE_M or peak < MIN_PEAK_VELOCITY or (b1 - b0) / fs < MIN_PHASE_SECONDS or swing < gate:
            continue
        # Le code quasi ferme (pause tra una ripetizione e l'altra) non fanno parte della fase.
        moving = np.where(np.abs(velocity[b0:b1]) >= STILL_SHARE * peak)[0]
        m0, m1 = int(b0 + moving[0]), int(b0 + moving[-1] + 1)
        # Una fase che tocca l'inizio o la fine della registrazione è un effetto di bordo del filtro, o un movimento tagliato.
        if m0 <= margin or m1 >= len(velocity) - margin:
            continue
        phases.append((m0, m1, travel, peak))
    if not phases:
        return SetAnalysis(reps=0, quality="no_movement")
    # Si scartano le fasi molto più corte o più lente di quelle tipiche: sono assestamenti, non ripetizioni.
    travels = np.array([abs(p[2]) for p in phases])
    speeds = travels / np.array([(p[1] - p[0]) / fs for p in phases])
    keep = (travels >= SMALL_PHASE_SHARE * np.percentile(travels, 80)) & (speeds >= SLOW_PHASE_SHARE * np.median(speeds))
    phases = [p for p, ok in zip(phases, keep) if ok]
    if not phases:
        return SetAnalysis(reps=0, quality="no_movement")

    # Il verso dell'asse è arbitrario: la prima fase è per definizione un'andata.
    outbound = 1.0 if phases[0][2] > 0 else -1.0
    reps: list[Rep] = []
    last_end = 0
    for i, (b0, b1, travel, peak) in enumerate(phases):
        if travel * outbound <= 0:
            continue
        # La ripetizione finisce con il ritorno che segue l'andata, se c'è.
        back = phases[i + 1] if i + 1 < len(phases) and phases[i + 1][2] * outbound < 0 else None
        end = back[1] if back else b1
        last_end = end
        reps.append(
            Rep(
                start_ms=int(round(b0 / fs * 1000)),
                duration_ms=int(round((end - b0) / fs * 1000)),
                range_m=round(abs(travel), 3),
                velocity=round(abs(travel) / ((b1 - b0) / fs), 3),
                peak_velocity=round(max(peak, back[3] if back else 0.0), 3),
            )
        )
    # Una sola andata senza ritorno non basta per dire che c'è stata una ripetizione.
    complete = sum(1 for i, p in enumerate(phases) if p[2] * outbound > 0 and i + 1 < len(phases) and phases[i + 1][2] * outbound < 0)
    if not reps or complete == 0:
        return SetAnalysis(reps=0, quality="no_movement")

    velocities = np.array([r.velocity for r in reps])
    durations = np.array([r.duration_ms for r in reps], dtype=float)
    ranges = np.array([r.range_m for r in reps])

    regularity = None
    velocity_loss = None
    if len(reps) >= 2:
        # Regolarità: quanto si somigliano le ripetizioni per durata e ampiezza (100 = identiche).
        variation = (np.std(durations) / np.mean(durations) + np.std(ranges) / max(np.mean(ranges), 1e-6)) / 2
        regularity = round(float(100 * (1 - min(1.0, variation / 0.45))), 1)
        best = float(np.max(velocities[:2]))
        velocity_loss = round(max(0.0, (best - float(velocities[-1])) / best * 100), 1) if best > 0 else None

    return SetAnalysis(
        reps=len(reps),
        quality="ok",
        avg_velocity=round(float(np.mean(velocities)), 3),
        peak_velocity=round(float(max(r.peak_velocity for r in reps)), 3),
        regularity=regularity,
        time_under_tension_ms=int(round(last_end / fs * 1000)) - reps[0].start_ms,
        velocity_loss_pct=velocity_loss,
        range_m=round(float(np.median(ranges)), 3),
        per_rep=reps,
    )
