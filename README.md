# MOTIX

Piattaforma di **BTECH S.r.l.** che collega chi si allena, il personal trainer e la struttura sportiva.
La specifica completa è nel documento «MOTIX – Progetto dell'app»; l'identità visiva nella brand identity MOTIX.

## Cosa c'è nel repository

| Cartella | Contenuto | Tecnologia |
|---|---|---|
| `apps/api` | Server: dati, accessi, ruoli, regole di business | Node.js, Fastify, Drizzle, PostgreSQL |
| `apps/mobile` | App per chi si allena (iPhone e Android) | React Native, Expo |
| `apps/web` | Dashboard della struttura, area personal trainer, pannello BTECH | React, Vite |
| `services/ai` | Motore AI: analisi dei dati del sensore, adattamento settimanale del piano | Python, FastAPI, NumPy, SciPy |
| `docs` | Proposta di protocollo Bluetooth del sensore motix pod | |
| `packages/shared` | Regole, tipi, validazioni e brand condivisi da tutte le parti | TypeScript |

## Stato dei lavori

| Tappa | Stato |
|---|---|
| 1. Struttura del progetto e database | Fatta |
| 2. Registrazione e ruoli | Fatta |
| 3. App utente: piano, sedute, idratazione, prova di 14 giorni | Fatta |
| 4. Area personal trainer e dashboard delle palestre (funzioni complete) | Fatta |
| 5. Community, shop e punti | Fatta |
| 6. Sensore e motore AI | Fatta (con sensore simulato: vedi sotto) |

### Provarlo online

Per navigare app e sito da un link, con quattro accessi di esempio già pronti (BTECH, struttura, personal trainer, utente):
[docs/ambiente-di-prova.md](docs/ambiente-di-prova.md).

## Cosa funziona oggi

- **Database** con tutte le entità della sezione 10 del documento (oltre 50 tabelle), già pronte anche per le tappe successive.
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
- **Personal trainer** (sito): report del cliente, editor del piano con proposta automatica da modificare, messaggi.
- **Struttura** (sito): panoramica, iscritti con rischio abbandono, alert con motivo e azione suggerita, scheda dell'iscritto
  con note, messaggi singoli e di gruppo, attività dei personal trainer, report mensile esportabile in CSV, locandina con QR.
- **Rischio abbandono**: punteggio a regole (`apps/api/src/services/risk.ts`) su giorni dall'ultima seduta, calo di frequenza,
  sedute saltate e ultimo accesso.
- **Messaggi**: chat tra personal trainer e cliente e tra struttura e iscritto, anche nell'app; per chi si allena rispondere è Premium.
- **Community** (app): feed della struttura e generale, post con foto o video, like, commenti, profili, classifica della
  struttura, elenco dei personal trainer, chat tra iscritti con profilo pubblico, segnalazioni e blocchi.
- **Shop by BLOR** (app): le voci del catalogo aprono il sito blorcompany.com con il codice della struttura o del personal trainer.
- **Video dei personal trainer**: per i propri clienti (compaiono nell'esercizio del piano) o per la community dopo la revisione.
- **Punti e premi**: punti al personal trainer quando un cliente si abbona o rinnova, catalogo premi, richieste e consegna.
- **Pannello BTECH**: moderazione delle segnalazioni, approvazione dei video, catalogo dello shop, premi e valore dei punti,
  attivazione manuale di un abbonamento (pilot e assistenza).
- **Sensore motix pod**: registro BTECH (magazzino, strutture, utenti, firmware, guasti), abbinamento nell'app, serie registrate
  dal sensore con conteggio in tempo reale, sensori della struttura già disponibili agli iscritti. È una funzione Premium.
- **Motore AI** (`services/ai`): dalle accelerazioni del sensore conta le ripetizioni e misura velocità, regolarità, tempo sotto
  tensione e calo di velocità; i dati entrano nel riepilogo della seduta e nel report per personal trainer e struttura.
- **Piano che si adatta**: a ogni nuova settimana il piano generato da MOTIX riparte con carichi, ripetizioni e durate aggiornati
  in base a sedute fatte, fatica dichiarata e dati del sensore, e dice cosa è cambiato. Il piano del personal trainer viene
  riproposto uguale. Un filtro di sicurezza nel server limita ogni aumento di carico al 10%.
- **Privacy**: struttura e personal trainer vedono i dati personali solo con il consenso dell'utente; registro delle azioni sensibili;
  cancellazione dell'account dall'app.

## Avvio in locale

Serve Node.js 20 o superiore.

```bash
npm install
cp .env.example .env          # poi cambia JWT_SECRET e la password dell'amministratore
npm run seed                  # crea il database e il primo amministratore BTECH
npm run dev:api               # server su http://localhost:4000
(cd services/ai && pip install -r requirements-dev.txt && uvicorn app.main:app --port 8000)   # motore AI
npm run dev:web               # sito su http://localhost:5173
npm run dev:mobile            # app: apri con Expo Go o premi «w» per il browser
```

Senza `DATABASE_URL` il server usa un database PostgreSQL su file nella cartella `apps/api/.data`,
quindi non serve installare nulla. Per usare PostgreSQL vero: `docker compose up -d` e nel file `.env`
`DATABASE_URL=postgres://motix:motix@localhost:5432/motix`.

In sviluppo le email non partono: testo e link compaiono nel log del server.

Il server trova il motore AI con `AI_URL`. Se il motore è spento l'app continua a funzionare: le serie si registrano a mano
e il piano della nuova settimana riparte uguale.

### Provare il sensore senza sensore

Il motix pod vero non è ancora collegabile: manca il firmware e il protocollo Bluetooth è una proposta da confermare
(`docs/motix-pod-protocollo.md`). Per provare tutto il percorso l'app ha un sensore simulato:

1. avvia l'app con `EXPO_PUBLIC_POD_SIMULATOR=1` (già nel file `.env.example`);
2. nel pannello BTECH, scheda «Sensori», registra il numero di serie `MP-SIM001`;
3. nell'app: Profilo → Sensore motix pod → «Cerca sensori vicini» → Abbina;
4. in una seduta, apri un esercizio e scegli «Serie 1 con il sensore».

Il simulatore produce accelerazioni verosimili nello stesso formato dei pacchetti Bluetooth proposti; l'analisi è quella vera.

## Verifiche

```bash
npm test            # test automatici dell'API, compresa la prova con il motore AI vero (se Python è installato)
(cd services/ai && pytest)   # test del motore AI
npm run typecheck   # controllo dei tipi su tutto il progetto
```

## Prima della produzione

- **Libreria esercizi**: le 52 schede iniziali (`apps/api/src/data/exercises.ts`) sono state create con l'AI e vanno riviste
  da BTECH, con i video, prima del lancio.
- **Abbonamento dagli store**: oggi la prova è gestita dall'app e, senza acquisto, finisce nella versione gratuita. Va deciso
  con Apple e Google se la prova diventa un'offerta introduttiva dello store (l'utente si abbona subito e paga dal 15° giorno).
- **Archivio dei file**: foto e video oggi sono salvati sul disco del server (`apps/api/src/lib/storage.ts`). In produzione va
  usato un archivio a oggetti con CDN in UE, con compressione dei video.
- **Moderazione**: i post sono pubblicati subito e nascosti dopo tre segnalazioni, in attesa di BTECH. Non c'è ancora un filtro
  automatico dei contenuti.
- **Sensore vero**: confermare il protocollo con chi sviluppa il motix pod, completare il driver Bluetooth
  (`apps/mobile/src/lib/pod.ts`, serve una build nativa dell'app), tarare le soglie dell'analisi su registrazioni reali
  (`services/ai/app/execution.py`) e ottenere la marcatura CE. Il simulatore non va mai acceso nelle versioni pubblicate.
- **Regole del motore AI**: le soglie dell'adattamento settimanale (`services/ai/app/adaptation.py`) vanno riviste e approvate
  da BTECH. LightGBM e utenti simili entrano con i dati del pilot; il modello linguistico per spiegazioni e messaggi non è
  ancora collegato (oggi i testi sono frasi composte dalle regole).
- **Motore AI in produzione**: su rete privata, con `AI_KEY` impostata. Con più istanze del server, sostituire il blocco in
  memoria dell'adattamento settimanale con un lock nel database (`apps/api/src/services/adaptation.ts`).
- **Apple Salute e Google Health Connect** (passi, battito, sonno, calorie): non ancora collegati.
- **Promemoria** di allenamento, idratazione e prova: richiedono le notifiche push (tappa successiva).
- Servizio di invio email con server in UE (oggi le email sono solo simulate): `apps/api/src/lib/mailer.ts`.
- Database PostgreSQL gestito in una regione UE e `JWT_SECRET` casuale.
- Accesso con Apple e Google (lo schema è già predisposto).
- Account sviluppatore Apple e Google di BTECH, abbonamenti in-app e pubblicazione con EAS.
- Testi legali definitivi: termini di servizio, informativa privacy, condizioni di affiliazione.
