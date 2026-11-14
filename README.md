# MOTIX

Piattaforma di **BTECH S.r.l.** che collega chi si allena, il personal trainer e la struttura sportiva.
La specifica completa è nel documento «MOTIX – Progetto dell'app»; l'identità visiva nella brand identity MOTIX.

## Cosa c'è nel repository

| Cartella | Contenuto | Tecnologia |
|---|---|---|
| `apps/api` | Server: dati, accessi, ruoli, regole di business | Node.js, Fastify, Drizzle, PostgreSQL |
| `apps/mobile` | App per chi si allena (iPhone e Android) | React Native, Expo |
| `apps/web` | Dashboard della struttura, area personal trainer, pannello BTECH | React, Vite |
| `services/ai` | Motore AI (per ora solo lo scheletro) | Python, FastAPI |
| `packages/shared` | Regole, tipi, validazioni e brand condivisi da tutte le parti | TypeScript |

## Stato dei lavori

| Tappa | Stato |
|---|---|
| 1. Struttura del progetto e database | Fatta |
| 2. Registrazione e ruoli | Fatta |
| 3. App utente: piano, sedute, idratazione, prova di 14 giorni | Fatta |
| 4. Area personal trainer e dashboard delle palestre (funzioni complete) | Da fare |
| 5. Community, shop e punti | Da fare |
| 6. Sensore e motore AI | Da fare |

### Cosa funziona oggi

- **Database** con tutte le entità della sezione 10 del documento (46 tabelle), già pronte anche per le tappe successive.
- **Chi si allena** (app): registrazione in tre passi, codice della struttura e del personal trainer facoltativi, codice amico,
  consensi separati, prova di 14 giorni che parte al primo accesso.
- **Minorenni**: sotto i 14 anni l'iscrizione è rifiutata; tra 14 e 17 anni l'account resta bloccato finché un genitore
  dà il consenso dal link ricevuto per email. Se lo nega, i dati vengono cancellati.
- **Strutture**: richiesta di affiliazione gratuita, approvazione da parte di BTECH, codice e QR per gli iscritti,
  elenco iscritti, invito di istruttori e personal trainer.
- **Personal trainer**: registrazione, approvazione, codice di invito, clienti (invito, richieste, chiusura),
  collegamento a più strutture.
- **Pannello BTECH**: numeri principali, approvazione di strutture e personal trainer, ricerca utenti.
- **Questionario e piano**: dal questionario (obiettivo, livello, giorni, attrezzi, limitazioni) nasce il piano della settimana,
  con la spiegazione delle scelte. Il generatore è a regole (`apps/api/src/services/planner.ts`): esclude gli esercizi che
  caricano le zone con limitazioni, usa solo gli attrezzi disponibili ed evita i carichi massimali tra 14 e 17 anni.
- **Seduta**: serie, ripetizioni e carichi registrati a mano, timer di recupero, fatica percepita, riepilogo con confronto
  con la volta precedente e con la settimana prima; la settimana dopo i carichi salgono dove le ripetizioni sono state completate.
- **Idratazione**: obiettivo su peso e allenamento del giorno (Premium) o standard, registrazione per contenitore.
- **Progressi**: sedute e volume per settimana, gruppi muscolari, forza, peso e misure, idratazione, diario.
- **Prova e versione gratuita**: disdetta della prova dall'app; finita la prova restano diario, allenamenti liberi,
  idratazione di base e progressi degli ultimi 7 giorni.
- **Privacy**: struttura e personal trainer vedono i dati personali solo con il consenso dell'utente; registro delle azioni sensibili;
  cancellazione dell'account dall'app.

## Avvio in locale

Serve Node.js 20 o superiore.

```bash
npm install
cp .env.example .env          # poi cambia JWT_SECRET e la password dell'amministratore
npm run seed                  # crea il database e il primo amministratore BTECH
npm run dev:api               # server su http://localhost:4000
npm run dev:web               # sito su http://localhost:5173
npm run dev:mobile            # app: apri con Expo Go o premi «w» per il browser
```

Senza `DATABASE_URL` il server usa un database PostgreSQL su file nella cartella `apps/api/.data`,
quindi non serve installare nulla. Per usare PostgreSQL vero: `docker compose up -d` e nel file `.env`
`DATABASE_URL=postgres://motix:motix@localhost:5432/motix`.

In sviluppo le email non partono: testo e link compaiono nel log del server.

## Verifiche

```bash
npm test            # test automatici dell'API e del generatore del piano
npm run typecheck   # controllo dei tipi su tutto il progetto
```

## Prima della produzione

- **Libreria esercizi**: le 52 schede iniziali (`apps/api/src/data/exercises.ts`) sono state create con l'AI e vanno riviste
  da BTECH, con i video, prima del lancio.
- **Abbonamento dagli store**: oggi la prova è gestita dall'app e, senza acquisto, finisce nella versione gratuita. Va deciso
  con Apple e Google se la prova diventa un'offerta introduttiva dello store (l'utente si abbona subito e paga dal 15° giorno).
- **Promemoria** di allenamento, idratazione e prova: richiedono le notifiche push (tappa successiva).
- Servizio di invio email con server in UE (oggi le email sono solo simulate): `apps/api/src/lib/mailer.ts`.
- Database PostgreSQL gestito in una regione UE e `JWT_SECRET` casuale.
- Accesso con Apple e Google (lo schema è già predisposto).
- Account sviluppatore Apple e Google di BTECH, abbonamenti in-app e pubblicazione con EAS.
- Testi legali definitivi: termini di servizio, informativa privacy, condizioni di affiliazione.
