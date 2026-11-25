# Ambiente di prova online

Un solo indirizzo con dentro tutto: app (versione web), sito, API e motore AI, più cinque accessi di esempio.
Serve per navigare MOTIX e farlo vedere; non è la configurazione di produzione.

| Indirizzo | Cosa c'è |
| --- | --- |
| `/` | Pagina iniziale con i due ingressi e gli accessi di esempio |
| `/app/` | App per chi si allena (dal telefono si vede come sarà sugli store) |
| `/sito/` | Dashboard della struttura, area personal trainer, pannello BTECH |
| `/api/` | API |

## Accessi di esempio

La password è la stessa per tutti: quella scelta alla creazione dell'ambiente (`DEMO_PASSWORD`).

| Ruolo | Email | Dove |
| --- | --- | --- |
| Admin BTECH | `admin@motix.demo` | Sito |
| Struttura affiliata (Fit Bari) | `struttura@motix.demo` | Sito |
| Personal trainer (Luca Verdi) | `trainer@motix.demo` | Sito |
| Nutrizionista (Sara Neri) | `nutrizionista@motix.demo` | Sito |
| Utente finale (Giulia Rossi) | `utente@motix.demo` | App |

Dati già presenti: Giulia è iscritta a Fit Bari, cliente di Luca e della nutrizionista Sara (piano alimentare e diario),
con un check-in commentato, una settimana di dati salute, abbonata, con tre sedute fatte con il sensore, un piano
alla seconda settimana, messaggi, post e misure. Altri due iscritti (uno attivo, uno a rischio abbandono) riempiono la
dashboard. Nel registro ci sono tre sensori e una segnalazione di guasto aperta. Luca ha un template di scheda e i
messaggi automatici accesi; Fit Bari ha un pacchetto di 10 abbonamenti pagato, uno già regalato a Paolo.
Se l'ambiente era già stato creato prima, questi dati in più si aggiungono da soli al primo riavvio.

Il sensore è simulato (`MP-SIM001`, già abbinato a Giulia): in una seduta scegli «Serie con il sensore» e l'app riceve i
dati di una serie finta, analizzati dal motore AI vero.

## Creare l'ambiente su Render

1. Crea un account su render.com entrando con GitHub e autorizza l'accesso al repository `motix`.
2. Apri `https://render.com/deploy?repo=https://github.com/blorcompany-jpg/motix`
   (oppure, dal pannello di Render: **New → Blueprint** e scegli il repository).
3. Render legge il file `render.yaml` e chiede un solo valore, `DEMO_PASSWORD`: scrivi la password che vuoi usare
   per i cinque accessi (almeno 10 caratteri). Conferma.
4. Aspetta la fine della prima costruzione (circa 10 minuti). L'indirizzo è quello del servizio `motix-prova`.

Limiti del piano gratuito: il servizio si addormenta dopo un po' di inattività (la prima apertura richiede circa un
minuto), il database gratuito ha una scadenza, foto e video caricati si perdono a ogni riavvio.

Per azzerare i dati: elimina e ricrea il database `motix-prova-db` da Render, poi riavvia il servizio.

## Su un altro servizio o in locale

Qualsiasi servizio che esegue un `Dockerfile` va bene. Variabili necessarie:

| Variabile | Valore |
| --- | --- |
| `DATABASE_URL` | Indirizzo di un database PostgreSQL |
| `JWT_SECRET` | Una stringa casuale di almeno 32 caratteri |
| `DEMO_PASSWORD` | Password degli accessi di esempio; se manca, i dati di esempio non vengono creati |
| `PUBLIC_URL` | Indirizzo pubblico del servizio (su Render non serve) |
| `PORT` | Porta su cui ascoltare (predefinita 4000) |

```bash
docker build -t motix-prova .
docker run -p 4000:4000 -e DATABASE_URL=… -e JWT_SECRET=… -e DEMO_PASSWORD=… -e PUBLIC_URL=http://localhost:4000 motix-prova
```

## Attenzione

- `DEMO_PASSWORD` non va mai impostata in produzione: crea un amministratore con una password nota.
- In questo ambiente il sensore simulato è acceso e le email non partono (restano nel log del server).
