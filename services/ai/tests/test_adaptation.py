"""Regole dell'adattamento settimanale."""

from app.adaptation import ExerciseWeek, SetDone, WeekInput, adapt_week


def ex(key="panca", unit="reps", loadable=True, sets=3, reps=10, load=40.0, sessions=None):
    return ExerciseWeek(key=key, name=key, unit=unit, loadable=loadable, sets=sets, reps=reps, load_kg=load, sessions=sessions or [])


def done(reps=10, load=40.0, n=3, loss=None):
    return [SetDone(reps, load, loss) for _ in range(n)]


def week(exercises, planned=3, completed=3, efforts=(7, 7, 7), minor=False):
    return WeekInput(planned_sessions=planned, completed_sessions=completed, efforts=list(efforts), minor=minor, exercises=exercises)


def one(decision):
    return decision.exercises[0]


def test_obiettivo_raggiunto_il_carico_sale_del_cinque_per_cento():
    d = adapt_week(week([ex(sessions=[done()])]))
    assert d.mode == "progress"
    assert one(d).action == "increase" and one(d).load_kg == 42.0
    assert "40 kg" in one(d).reason and "42 kg" in one(d).reason


def test_settimana_facile_sale_di_piu_ma_mai_oltre_il_dieci_per_cento():
    d = adapt_week(week([ex(sessions=[done()])], efforts=(4, 5, 4)))
    assert one(d).load_kg == 43.0
    assert one(d).load_kg <= 44.0


def test_minorenne_aumento_prudente():
    d = adapt_week(week([ex(sessions=[done()])], minor=True))
    assert one(d).load_kg == 41.0
    assert any("14 e 17" in line for line in d.summary)


def test_carichi_piccoli_salgono_almeno_di_mezzo_chilo():
    d = adapt_week(week([ex(load=4.0, sessions=[done(load=4.0)])]))
    assert one(d).load_kg == 4.5


def test_ripetizioni_mancate_carico_confermato():
    d = adapt_week(week([ex(sessions=[[SetDone(10, 40), SetDone(9, 40), SetDone(10, 40)]])]))
    assert one(d).action == "hold" and one(d).load_kg == 40.0


def test_due_sedute_sotto_obiettivo_il_carico_scende():
    bad = [SetDone(8, 40), SetDone(7, 40), SetDone(6, 40)]
    d = adapt_week(week([ex(sessions=[bad, bad])]))
    assert one(d).action == "decrease" and one(d).load_kg == 38.0


def test_fatica_molto_alta_settimana_di_scarico():
    d = adapt_week(week([ex(sessions=[done()]), ex(key="plank", unit="seconds", loadable=False, reps=30, load=None, sessions=[done(30, None)])], efforts=(9, 10, 9)))
    assert d.mode == "deload"
    assert d.exercises[0].action == "decrease" and d.exercises[0].load_kg == 36.0
    assert d.exercises[1].action == "hold"


def test_poche_sedute_il_piano_resta_fermo():
    d = adapt_week(week([ex(sessions=[done()])], planned=4, completed=1, efforts=(6,)))
    assert d.mode == "hold" and one(d).action == "hold" and one(d).load_kg == 40.0


def test_nessuna_seduta_nessun_aumento():
    d = adapt_week(week([ex()], completed=0, efforts=()))
    assert d.mode == "hold" and one(d).action == "hold"


def test_il_sensore_frena_l_aumento_se_le_ultime_ripetizioni_rallentano_troppo():
    d = adapt_week(week([ex(sessions=[done(loss=45.0)])]))
    assert one(d).action == "hold" and "sensore" in one(d).reason
    d = adapt_week(week([ex(sessions=[done(loss=15.0)])]))
    assert one(d).action == "increase"


def test_corpo_libero_salgono_le_ripetizioni_fino_al_tetto():
    d = adapt_week(week([ex(key="piegamenti", loadable=False, reps=12, load=None, sessions=[done(12, None)])]))
    assert one(d).action == "increase" and one(d).reps == 13 and one(d).load_kg is None
    d = adapt_week(week([ex(key="piegamenti", loadable=False, reps=20, load=None, sessions=[done(20, None)])]))
    assert one(d).action == "hold" and one(d).reps == 20


def test_esercizi_a_tempo():
    d = adapt_week(week([ex(key="plank", unit="seconds", loadable=False, reps=30, load=None, sessions=[done(30, None)])]))
    assert one(d).reps == 35
    d = adapt_week(week([ex(key="cyclette", unit="minutes", loadable=False, sets=1, reps=10, load=None, sessions=[done(10, None, n=1)])], efforts=(5, 6, 6)))
    assert one(d).reps == 11


def test_esercizio_non_eseguito_o_senza_carico_resta_uguale():
    d = adapt_week(week([ex(), ex(key="lat", load=None, sessions=[done(load=None)])]))
    assert [e.action for e in d.exercises] == ["hold", "hold"]
    assert "Registra il carico" in d.exercises[1].reason


def test_carico_usato_piu_alto_del_previsto_si_parte_da_quello():
    d = adapt_week(week([ex(sessions=[done(load=45.0)])]))
    assert one(d).load_kg == 47.5
