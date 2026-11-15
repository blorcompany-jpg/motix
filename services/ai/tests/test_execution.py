"""Analisi dell'esecuzione su segnali simulati."""

import pytest

from app.execution import analyze_set
from app.synthetic import simulate_rest, simulate_set


def run(**kw):
    s = simulate_set(**kw)
    return analyze_set(s["ax"], s["ay"], s["az"], s["sampleRateHz"])


@pytest.mark.parametrize(
    "reps,kw",
    [
        (10, {}),
        (1, {}),
        (2, {}),
        (6, dict(rep_seconds=4.0, range_m=0.35)),
        (4, dict(rep_seconds=6.0, range_m=0.4)),
        (15, dict(rep_seconds=1.3, range_m=0.25, pause_seconds=0.1)),
        (20, dict(rep_seconds=1.8, pause_seconds=0)),
        (12, dict(rep_seconds=1.2, range_m=0.1)),
        (10, dict(pause_seconds=2.5)),
        (8, dict(noise=0.15)),
        (10, dict(sample_rate_hz=100)),
        (10, dict(sample_rate_hz=25, tilt_deg=70)),
    ],
)
def test_conta_le_ripetizioni(reps, kw):
    for seed in range(5):
        assert run(reps=reps, seed=seed, **kw).reps == reps


def test_velocita_e_ampiezza_vicine_al_vero():
    # 45 cm in 1,2 secondi di andata: 0,375 m/s.
    r = run(reps=10)
    assert r.quality == "ok"
    assert r.avg_velocity == pytest.approx(0.375, rel=0.12)
    assert r.range_m == pytest.approx(0.45, rel=0.08)
    assert all(rep.duration_ms == pytest.approx(2400, rel=0.1) for rep in r.per_rep)
    assert r.time_under_tension_ms == pytest.approx(10 * 2400 + 9 * 400, rel=0.05)


def test_serie_regolare_ha_regolarita_alta_e_calo_nullo():
    r = run(reps=10)
    assert r.regularity > 85
    assert r.velocity_loss_pct < 10


def test_serie_irregolare_ha_regolarita_bassa():
    r = run(reps=8, rep_seconds=[2, 3.5, 1.6, 2.8, 2, 4, 1.5, 3], range_m=[0.45, 0.3, 0.5, 0.25, 0.45, 0.3, 0.5, 0.35])
    assert r.reps == 8
    assert r.regularity < 50


def test_la_fatica_si_vede_nel_calo_di_velocita():
    r = run(reps=8, rep_seconds=[2, 2, 2.1, 2.2, 2.4, 2.7, 3.1, 3.6])
    assert r.reps == 8
    assert 30 < r.velocity_loss_pct < 55
    assert r.per_rep[0].velocity > r.per_rep[-1].velocity


def test_sensore_fermo_non_conta_nulla():
    for seed in range(20):
        s = simulate_rest(seconds=40, seed=seed)
        r = analyze_set(s["ax"], s["ay"], s["az"], s["sampleRateHz"])
        assert r.reps == 0 and r.quality == "no_movement"


def test_registrazione_troppo_corta():
    assert analyze_set([0.0] * 20, [0.0] * 20, [9.8] * 20, 50).quality == "too_short"
