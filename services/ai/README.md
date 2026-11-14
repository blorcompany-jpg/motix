# Motore AI

Servizio Python separato, chiamato solo dal backend.

```bash
cd services/ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Per ora risponde solo a `GET /health`. I moduli (piano, analisi del sensore, idratazione,
rischio abbandono) vengono aggiunti nella tappa dedicata.
