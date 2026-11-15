/**
 * Collegamento al sensore motix pod.
 *
 * Due driver con la stessa interfaccia:
 * - simulatore: produce i dati di una serie finta, per sviluppare e mostrare l'app senza sensore;
 * - Bluetooth: da completare quando BTECH conferma il protocollo del firmware (docs/motix-pod-protocollo.md).
 *
 * Il simulatore si attiva con EXPO_PUBLIC_POD_SIMULATOR=1 e non va mai acceso nelle versioni pubblicate.
 */
import { decodePodPacket, encodePodPacket, POD_SAMPLE_RATE_HZ, simulatePodSet, type Sample } from '@motix/shared';

export interface PodInfo {
  serial: string;
  name: string;
  batteryPct: number | null;
  firmware: string | null;
}

export interface PodDriver {
  kind: 'simulator' | 'bluetooth';
  /** false quando su questo telefono il sensore non si può collegare. */
  available: boolean;
  sampleRateHz: number;
  /** Cerca i sensori accesi nelle vicinanze. */
  scan(): Promise<PodInfo[]>;
  connect(serial: string): Promise<PodInfo>;
  /** Avvia lo streaming: `onSamples` riceve i campioni in m/s² man mano che arrivano. */
  start(onSamples: (samples: Sample[], seq: number) => void, hint?: { reps?: number }): Promise<void>;
  stop(): Promise<void>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SimulatedPod implements PodDriver {
  kind = 'simulator' as const;
  available = true;
  sampleRateHz = POD_SAMPLE_RATE_HZ;
  private timer: ReturnType<typeof setInterval> | null = null;
  private info: PodInfo = {
    serial: (process.env.EXPO_PUBLIC_POD_SIMULATOR_SERIAL ?? 'MP-SIM001').toUpperCase(),
    name: 'motix pod (simulato)',
    batteryPct: 86,
    firmware: 'sim-1.0',
  };
  /** Per le prove automatiche il tempo simulato può scorrere più in fretta. */
  private speed = Math.max(1, Number(process.env.EXPO_PUBLIC_POD_SIMULATOR_SPEED ?? 1) || 1);

  async scan() {
    await wait(900 / this.speed);
    return [this.info];
  }

  async connect(serial: string) {
    await wait(500 / this.speed);
    if (serial.toUpperCase() !== this.info.serial) throw new Error('Sensore non trovato nelle vicinanze: controlla che sia acceso');
    return this.info;
  }

  async start(onSamples: (samples: Sample[], seq: number) => void, hint: { reps?: number } = {}) {
    await this.stop();
    const reps = hint.reps ?? 10;
    // Una serie verosimile: ritmo un po' diverso a ogni ripetizione e le ultime più lente.
    const repSeconds = Array.from({ length: reps }, (_, i) => 2.1 + Math.random() * 0.3 + Math.max(0, i - reps * 0.6) * 0.18);
    const signal = simulatePodSet({ reps, repSeconds, rangeM: 0.42, idleSeconds: 1.5, seed: Math.floor(Math.random() * 1e9) });
    const chunk = 5;
    let at = 0;
    let seq = 0;
    this.timer = setInterval(
      () => {
        for (let k = 0; k < this.speed; k++) {
          const samples: Sample[] = [];
          for (let i = 0; i < chunk; i++, at++) {
            // Finita la serie simulata il sensore resta fermo: solo gravità.
            const j = Math.min(at, signal.ax.length - 1);
            samples.push([signal.ax[j]!, signal.ay[j]!, signal.az[j]!]);
          }
          // I campioni passano dal formato dei pacchetti Bluetooth, come con il sensore vero.
          const packet = decodePodPacket(encodePodPacket(seq++, samples));
          onSamples(packet.samples, packet.seq);
        }
      },
      (chunk / this.sampleRateHz) * 1000,
    );
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

class BluetoothPod implements PodDriver {
  kind = 'bluetooth' as const;
  // TODO BTECH: completare con una libreria BLE (ad esempio react-native-ble-plx) quando il protocollo è confermato.
  // Servono una build nativa dell'app (non Expo Go) e i permessi Bluetooth in app.json.
  available = false;
  sampleRateHz = POD_SAMPLE_RATE_HZ;
  private unavailable(): never {
    throw new Error('Il collegamento Bluetooth con il motix pod non è ancora attivo in questa versione');
  }
  async scan(): Promise<PodInfo[]> {
    return this.unavailable();
  }
  async connect(): Promise<PodInfo> {
    return this.unavailable();
  }
  async start(): Promise<void> {
    return this.unavailable();
  }
  async stop() {}
}

export const pod: PodDriver = process.env.EXPO_PUBLIC_POD_SIMULATOR === '1' ? new SimulatedPod() : new BluetoothPod();

export const velocity = (v: number | null) => (v === null ? '—' : `${v.toFixed(2).replace('.', ',')} m/s`);
