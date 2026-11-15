/**
 * Sensore motix pod: formato dei dati, simulatore e conteggio in tempo reale.
 *
 * ATTENZIONE: il protocollo Bluetooth qui sotto è una PROPOSTA, scritta per poter costruire e provare l'app
 * prima che il firmware esista. Va concordata con chi sviluppa il sensore (vedi docs/motix-pod-protocollo.md):
 * se cambia, basta aggiornare questo file e il driver Bluetooth dell'app.
 */

export const G = 9.80665;

/** Identificativi Bluetooth Low Energy proposti per il motix pod. */
export const POD_BLE = {
  /** Nome pubblicizzato: «motix pod » seguito dalle ultime cifre del numero di serie. */
  namePrefix: 'motix pod',
  service: '6d6f7469-7800-4d50-8f00-000000000001',
  /** Notifiche: pacchetti di campioni dell'accelerometro. */
  stream: '6d6f7469-7800-4d50-8f00-000000000002',
  /** Scrittura: 0x01 avvia lo streaming, 0x00 lo ferma. */
  control: '6d6f7469-7800-4d50-8f00-000000000003',
  /** Lettura: numero di serie (testo), ad esempio «MP-A1B2C3». */
  serial: '6d6f7469-7800-4d50-8f00-000000000004',
  /** Servizi standard: batteria (0x180F) e informazioni sul dispositivo (0x180A, versione del firmware). */
  battery: '0000180f-0000-1000-8000-00805f9b34fb',
  deviceInfo: '0000180a-0000-1000-8000-00805f9b34fb',
} as const;

export const POD_SAMPLE_RATE_HZ = 50;
/** Un'unità dell'accelerometro vale un millesimo di g. */
const LSB = G / 1000;
const HEADER = 3;

export type Sample = [number, number, number];

export interface PodSignal {
  sampleRateHz: number;
  ax: number[];
  ay: number[];
  az: number[];
}

/**
 * Pacchetto dello streaming (little-endian):
 *   uint16 numero progressivo del pacchetto · uint8 numero di campioni N · N × (int16 ax, int16 ay, int16 az) in mg.
 * Con 3 campioni sta nei 20 byte di un pacchetto BLE minimo; con MTU più grande ne porta fino a 40.
 */
export function encodePodPacket(seq: number, samples: Sample[]): Uint8Array {
  const out = new Uint8Array(HEADER + samples.length * 6);
  const view = new DataView(out.buffer);
  view.setUint16(0, seq & 0xffff, true);
  view.setUint8(2, samples.length);
  samples.forEach((s, i) => s.forEach((v, axis) => view.setInt16(HEADER + i * 6 + axis * 2, Math.max(-32768, Math.min(32767, Math.round(v / LSB))), true)));
  return out;
}

/** Legge un pacchetto: restituisce i campioni in m/s². Lancia un errore se il pacchetto è malformato. */
export function decodePodPacket(bytes: Uint8Array): { seq: number; samples: Sample[] } {
  if (bytes.length < HEADER) throw new Error('Pacchetto del sensore troppo corto');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint8(2);
  if (bytes.length !== HEADER + n * 6) throw new Error('Pacchetto del sensore di lunghezza inattesa');
  const samples: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const at = HEADER + i * 6;
    samples.push([view.getInt16(at, true) * LSB, view.getInt16(at + 2, true) * LSB, view.getInt16(at + 4, true) * LSB]);
  }
  return { seq: view.getUint16(0, true), samples };
}

/** Raccoglie i campioni di una serie e conta i pacchetti persi (buchi nel numero progressivo). */
export class PodRecorder {
  private ax: number[] = [];
  private ay: number[] = [];
  private az: number[] = [];
  private lastSeq: number | null = null;
  lostPackets = 0;

  constructor(public sampleRateHz = POD_SAMPLE_RATE_HZ) {}

  push(samples: Sample[], seq?: number) {
    if (seq !== undefined) {
      if (this.lastSeq !== null) this.lostPackets += ((seq - this.lastSeq - 1) & 0xffff) % 0xffff;
      this.lastSeq = seq;
    }
    for (const [x, y, z] of samples) {
      this.ax.push(x);
      this.ay.push(y);
      this.az.push(z);
    }
  }

  get seconds() {
    return this.ax.length / this.sampleRateHz;
  }

  /** Il segnale da mandare al server, arrotondato per non appesantire la richiesta. */
  signal(): PodSignal {
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return { sampleRateHz: this.sampleRateHz, ax: this.ax.map(round), ay: this.ay.map(round), az: this.az.map(round) };
  }
}

/* ---------- Simulatore ---------- */

/** Numeri casuali ripetibili: stessi parametri, stesso segnale. */
function random(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Rumore gaussiano (Box-Muller).
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

export interface SimulatedSet {
  reps: number;
  /** Durata di ogni ripetizione, in secondi: un numero per tutte, oppure una per ripetizione. */
  repSeconds?: number | number[];
  /** Ampiezza del movimento, in metri. */
  rangeM?: number | number[];
  pauseSeconds?: number;
  /** Tempo fermo prima e dopo la serie. */
  idleSeconds?: number;
  sampleRateHz?: number;
  noise?: number;
  tiltDeg?: number;
  seed?: number;
}

/** Simula ciò che il sensore misura su un macchinario guidato: sale e scende lungo una linea, più gravità e rumore. */
export function simulatePodSet(opts: SimulatedSet): PodSignal {
  const fs = opts.sampleRateHz ?? POD_SAMPLE_RATE_HZ;
  const each = <T,>(v: T | T[] | undefined, fallback: T) => Array.from({ length: opts.reps }, (_, i) => (Array.isArray(v) ? (v[i] ?? fallback) : (v ?? fallback)));
  const durations = each(opts.repSeconds, 2.4);
  const ranges = each(opts.rangeM, 0.45);
  const idle = Math.round((opts.idleSeconds ?? 1.5) * fs);
  const pause = Math.round((opts.pauseSeconds ?? 0.4) * fs);

  const position: number[] = Array(idle).fill(0);
  durations.forEach((duration, i) => {
    const n = Math.round(duration * fs);
    for (let k = 0; k < n; k++) position.push((ranges[i]! * (1 - Math.cos((2 * Math.PI * k) / n))) / 2);
    for (let k = 0; k < pause; k++) position.push(0);
  });
  for (let k = 0; k < idle; k++) position.push(0);

  const gauss = random(opts.seed ?? 7);
  const noise = opts.noise ?? 0.05;
  const tilt = ((opts.tiltDeg ?? 20) * Math.PI) / 180;
  const signal: PodSignal = { sampleRateHz: fs, ax: [], ay: [], az: [] };
  for (let i = 0; i < position.length; i++) {
    const prev = position[Math.max(0, i - 1)]!;
    const next = position[Math.min(position.length - 1, i + 1)]!;
    const accel = (next - 2 * position[i]! + prev) * fs * fs;
    signal.ax.push(accel * Math.sin(tilt) + noise * gauss());
    signal.ay.push(noise * gauss());
    signal.az.push(accel * Math.cos(tilt) + G + noise * gauss());
  }
  return signal;
}

/* ---------- Conteggio in tempo reale ---------- */

/**
 * Conta le ripetizioni mentre la serie è in corso, per mostrarle sullo schermo.
 * È una stima rapida: il conteggio che viene salvato è quello del motore AI, calcolato a fine serie su tutto il segnale.
 *
 * Segue la velocità del sensore (accelerazione senza gravità, integrata con una «perdita» che evita la deriva):
 * ogni ripetizione è fatta di due tratti in movimento, andata e ritorno.
 */
export class LiveRepCounter {
  private gravity: Sample | null = null;
  private velocity: Sample = [0, 0, 0];
  private moving = false;
  private movingFor = 0;
  private strokes = 0;
  private peak = 0;

  constructor(private sampleRateHz = POD_SAMPLE_RATE_HZ) {}

  get reps() {
    return Math.floor(this.strokes / 2);
  }

  push(samples: Sample[]) {
    const dt = 1 / this.sampleRateHz;
    // La gravità si aggiorna lentamente (qualche secondo), la velocità «dimentica» in circa un secondo e mezzo.
    const gravityBlend = dt / 4;
    const leak = Math.exp(-dt / 1.5);
    for (const s of samples) {
      if (!this.gravity) this.gravity = [...s] as Sample;
      let speed2 = 0;
      for (let axis = 0; axis < 3; axis++) {
        this.gravity[axis] = this.gravity[axis]! + (s[axis]! - this.gravity[axis]!) * gravityBlend;
        this.velocity[axis] = (this.velocity[axis]! + (s[axis]! - this.gravity[axis]!) * dt) * leak;
        speed2 += this.velocity[axis]! ** 2;
      }
      const speed = Math.sqrt(speed2);
      // Soglie con isteresi: il tratto comincia sopra 0,10 m/s e finisce sotto 0,05 m/s.
      if (!this.moving && speed > 0.1) {
        this.moving = true;
        this.movingFor = 0;
        this.peak = 0;
      } else if (this.moving) {
        this.movingFor += dt;
        this.peak = Math.max(this.peak, speed);
        if (speed < Math.max(0.05, this.peak * 0.25)) {
          this.moving = false;
          // Un tratto troppo breve è un urto, non un movimento.
          if (this.movingFor >= 0.3) this.strokes += 1;
        }
      }
    }
    return this.reps;
  }
}
