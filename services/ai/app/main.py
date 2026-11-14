"""Motore AI di MOTIX (sezione 8 del documento di progetto).

In questa tappa il servizio espone solo il controllo di stato. I moduli arrivano con la tappa
«sensore e motore AI»:

- raccomandazione del piano: selezione, ordinamento (LightGBM), filtro di sicurezza;
- analisi dell'esecuzione dai dati del sensore motix pod;
- obiettivo di idratazione;
- punteggio di rischio abbandono.

Il backend Node.js è l'unico a chiamare questo servizio: app e web non lo raggiungono direttamente.
"""

from fastapi import FastAPI

app = FastAPI(title="MOTIX AI", version="0.1.0")


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "motix-ai"}
