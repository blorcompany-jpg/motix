# Motore AI

Servizio Python separato, chiamato solo dal backend (mai dall'app o dal sito).

```bash
cd services/ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest
```

## Cosa fa

| Indirizzo | Modulo | Cosa restituisce |
| --- | --- | --- |
| `POST /v1/execution/set` | `app/execution.py` | Dalle accelerazioni del motix pod: ripetizioni, velocità, regolarità, tempo sotto tensione, calo di velocità |
| `POST /v1/plan/adapt-week` | `app/adaptation.py` | Per ogni esercizio del piano: aumentare, confermare o ridurre, con il motivo |
| `GET /health` | | Stato del servizio |

Entrambi i moduli usano regole esplicite: sono verificabili e non hanno bisogno di dati per partire.
Le soglie sono costanti in cima a ogni file e vanno tarate dal team BTECH con i dati del pilot.

`app/synthetic.py` genera segnali simulati del sensore, usati dai test finché non ci sono registrazioni vere.

## Sicurezza

Imposta `AI_SERVICE_KEY` (la stessa nel backend, variabile `AI_KEY`): ogni richiesta deve portarla
nell'intestazione `X-Motix-Key`. In produzione il servizio va tenuto su rete privata.

## Cosa manca

- Ordinamento delle alternative con LightGBM e suggerimenti dagli utenti simili: servono i dati del pilot.
- Spiegazioni e messaggi scritti da un modello linguistico: oggi i testi sono frasi fisse composte dalle regole.
