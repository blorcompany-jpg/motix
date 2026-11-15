"""Il servizio visto dal backend."""

from fastapi.testclient import TestClient

from app.main import app
from app.synthetic import simulate_set

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["ok"] is True


def test_analisi_di_una_serie():
    r = client.post("/v1/execution/set", json=simulate_set(reps=8))
    assert r.status_code == 200
    body = r.json()
    assert body["reps"] == 8 and body["quality"] == "ok"
    assert len(body["perRep"]) == 8 and body["avgVelocity"] > 0.3


def test_assi_di_lunghezza_diversa_o_fuori_scala():
    assert client.post("/v1/execution/set", json={"sampleRateHz": 50, "ax": [0.0], "ay": [], "az": []}).status_code == 422
    assert client.post("/v1/execution/set", json={"sampleRateHz": 50, "ax": [9000.0], "ay": [0.0], "az": [0.0]}).status_code == 422


def test_adattamento_settimanale():
    body = {
        "plannedSessions": 3,
        "completedSessions": 3,
        "efforts": [7, 7, 6],
        "exercises": [
            {"key": "a", "name": "Panca", "unit": "reps", "loadable": True, "sets": 3, "reps": 10, "loadKg": 40,
             "sessions": [[{"reps": 10, "loadKg": 40}, {"reps": 10, "loadKg": 40}, {"reps": 10, "loadKg": 40}]]},
        ],
    }
    r = client.post("/v1/plan/adapt-week", json=body)
    assert r.status_code == 200
    assert r.json()["exercises"][0] == {"key": "a", "action": "increase", "sets": 3, "reps": 10, "loadKg": 42.0, "reason": "Tutte le ripetizioni completate, da 40 kg a 42 kg."}


def test_chiave_del_servizio(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "segreta")
    assert client.post("/v1/execution/set", json=simulate_set(reps=2)).status_code == 401
    assert client.post("/v1/execution/set", json=simulate_set(reps=2), headers={"X-Motix-Key": "segreta"}).status_code == 200
    assert client.get("/health").status_code == 200
