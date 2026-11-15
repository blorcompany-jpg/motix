# motix pod: proposta di protocollo Bluetooth

> **Stato: proposta.** Questo documento descrive come l'app si aspetta di parlare con il sensore.
> È stato scritto per poter costruire e provare l'app prima che il firmware esista. Va rivisto e
> confermato da chi sviluppa il sensore: ogni punto si può cambiare, basta aggiornare
> `packages/shared/src/pod.ts` (formato dei dati) e `apps/mobile/src/lib/pod.ts` (collegamento).

## Cosa serve all'app

1. Trovare i sensori accesi nelle vicinanze e leggerne il numero di serie.
2. Ricevere l'accelerazione sui tre assi mentre l'utente fa una serie.
3. Leggere carica della batteria e versione del firmware.

Il sensore **non deve contare le ripetizioni**: manda i dati grezzi, il conteggio e le misure
(velocità, regolarità, tempo sotto tensione) li fa il motore AI sul server. Così l'analisi si può
migliorare senza aggiornare il firmware.

## Numero di serie

`MP-` seguito da 6-12 lettere maiuscole o cifre, ad esempio `MP-A1B2C3`. È stampato sul sensore ed è
lo stesso che BTECH inserisce nel registro dei sensori del pannello.

## Bluetooth Low Energy

| Elemento | Valore proposto |
| --- | --- |
| Nome pubblicizzato | `motix pod XXXX` (ultime 4 cifre del numero di serie) |
| Servizio motix | `6d6f7469-7800-4d50-8f00-000000000001` |
| Caratteristica **stream** (notifiche) | `…0002` — pacchetti di campioni, vedi sotto |
| Caratteristica **control** (scrittura) | `…0003` — `0x01` avvia lo streaming, `0x00` lo ferma |
| Caratteristica **serial** (lettura) | `…0004` — numero di serie come testo |
| Batteria | servizio standard `0x180F` |
| Firmware | servizio standard `0x180A` (Device Information, Firmware Revision) |

## Pacchetto dello streaming

Little-endian.

| Byte | Tipo | Contenuto |
| --- | --- | --- |
| 0-1 | uint16 | Numero progressivo del pacchetto (riparte da 0 dopo 65535): serve a capire se ne è andato perso qualcuno |
| 2 | uint8 | Numero di campioni N nel pacchetto |
| 3… | N × 3 × int16 | Per ogni campione: accelerazione X, Y, Z in **millesimi di g**, gravità compresa |

- Frequenza di campionamento: **50 Hz** (accettabile tra 25 e 100 Hz, purché costante e dichiarata).
- Fondo scala consigliato: ±8 g.
- Con 3 campioni il pacchetto sta nei 20 byte di una connessione BLE minima; con MTU più grande ne può portare di più.
- L'orientamento del sensore non conta: l'analisi trova da sola la direzione del movimento.

## Domande aperte per chi sviluppa il sensore

- Il sensore ha anche il giroscopio? Servirebbe per gli attrezzi che ruotano (manubri, kettlebell): oggi su quelli il conteggio funziona, la velocità è solo indicativa.
- Rumore dell'accelerometro a riposo: l'analisi è tarata per circa 5 mg; oltre 15 mg peggiora.
- Autonomia con streaming continuo a 50 Hz e comportamento a batteria scarica.
- Aggiornamento del firmware via Bluetooth: non previsto in questa versione dell'app.
- Più telefoni vicini: un sensore accetta una connessione alla volta?

## Come provare senza sensore

L'app ha un simulatore che produce i dati di una serie finta, nello stesso formato dei pacchetti qui sopra.
Si attiva avviando l'app con `EXPO_PUBLIC_POD_SIMULATOR=1`; il sensore simulato ha numero di serie
`MP-SIM001`, da registrare nel pannello BTECH (scheda «Sensori») prima di abbinarlo.
