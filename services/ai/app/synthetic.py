"""Segnali di prova: simulano ciò che il motix pod misura durante una serie.

Servono ai test e a provare il servizio finché non ci sono registrazioni vere del sensore.
"""

from __future__ import annotations

import numpy as np

G = 9.80665


def simulate_set(
    reps: int,
    rep_seconds: float | list[float] = 2.4,
    range_m: float | list[float] = 0.45,
    pause_seconds: float = 0.4,
    idle_seconds: float = 1.5,
    sample_rate_hz: float = 50.0,
    noise: float = 0.05,
    tilt_deg: float = 20.0,
    seed: int = 7,
) -> dict[str, object]:
    """Una serie su un macchinario guidato: il sensore sale e scende lungo una linea inclinata di `tilt_deg`."""
    rng = np.random.default_rng(seed)
    fs = sample_rate_hz
    durations = [rep_seconds] * reps if isinstance(rep_seconds, (int, float)) else list(rep_seconds)
    ranges = [range_m] * reps if isinstance(range_m, (int, float)) else list(range_m)

    position = [np.zeros(int(idle_seconds * fs))]
    for duration, amplitude in zip(durations, ranges):
        t = np.arange(int(duration * fs)) / fs
        position.append(amplitude * (1 - np.cos(2 * np.pi * t / duration)) / 2)
        position.append(np.zeros(int(pause_seconds * fs)))
    position.append(np.zeros(int(idle_seconds * fs)))
    p = np.concatenate(position)
    accel = np.gradient(np.gradient(p, 1 / fs), 1 / fs)

    tilt = np.radians(tilt_deg)
    direction = np.array([np.sin(tilt), 0.0, np.cos(tilt)])
    a = np.outer(accel, direction) + np.array([0.0, 0.0, G])
    a += rng.normal(0, noise, a.shape)
    return {"sampleRateHz": fs, "ax": a[:, 0].tolist(), "ay": a[:, 1].tolist(), "az": a[:, 2].tolist()}


def simulate_rest(seconds: float = 6.0, sample_rate_hz: float = 50.0, noise: float = 0.05, seed: int = 3) -> dict[str, object]:
    """Sensore fermo: solo gravità e rumore."""
    rng = np.random.default_rng(seed)
    n = int(seconds * sample_rate_hz)
    a = np.tile([0.0, 0.0, G], (n, 1)) + rng.normal(0, noise, (n, 3))
    return {"sampleRateHz": sample_rate_hz, "ax": a[:, 0].tolist(), "ay": a[:, 1].tolist(), "az": a[:, 2].tolist()}
