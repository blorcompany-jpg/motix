import { describe, expect, it } from 'vitest';
import { decodePodPacket, encodePodPacket, G, LiveRepCounter, PodRecorder, simulatePodSet, type Sample } from '@motix/shared';

const samplesOf = (s: { ax: number[]; ay: number[]; az: number[] }): Sample[] => s.ax.map((x, i) => [x, s.ay[i]!, s.az[i]!]);

describe('pacchetti del motix pod', () => {
  it('codifica e decodifica i campioni al millesimo di g', () => {
    const samples: Sample[] = [[0, 0, G], [1.234, -2.5, 9.1], [-15, 0.004, 12]];
    const packet = encodePodPacket(65535, samples);
    expect(packet).toHaveLength(3 + 3 * 6);
    const decoded = decodePodPacket(packet);
    expect(decoded.seq).toBe(65535);
    decoded.samples.forEach((s, i) => s.forEach((v, axis) => expect(v).toBeCloseTo(samples[i]![axis]!, 2)));
  });

  it('rifiuta i pacchetti malformati', () => {
    expect(() => decodePodPacket(new Uint8Array([1]))).toThrow();
    expect(() => decodePodPacket(new Uint8Array([0, 0, 2, 1, 2, 3, 4, 5, 6]))).toThrow();
  });

  it('il registratore conta i pacchetti persi, anche a cavallo del numero massimo', () => {
    const rec = new PodRecorder();
    rec.push([[0, 0, G]], 65534);
    rec.push([[0, 0, G]], 65535);
    rec.push([[0, 0, G]], 2); // persi 0 e 1
    expect(rec.lostPackets).toBe(2);
    expect(rec.signal()).toMatchObject({ sampleRateHz: 50, ax: [0, 0, 0] });
    expect(rec.seconds).toBeCloseTo(0.06);
  });
});

describe('conteggio in tempo reale', () => {
  const count = (opts: Parameters<typeof simulatePodSet>[0]) => {
    const signal = simulatePodSet(opts);
    const counter = new LiveRepCounter(signal.sampleRateHz);
    const samples = samplesOf(signal);
    // I campioni arrivano a gruppi, come dal Bluetooth.
    for (let i = 0; i < samples.length; i += 5) counter.push(samples.slice(i, i + 5));
    return counter.reps;
  };

  it('segue le ripetizioni di una serie normale', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(count({ reps: 10, seed })).toBe(10);
      expect(count({ reps: 12, repSeconds: 1.6, rangeM: 0.3, seed })).toBe(12);
      expect(count({ reps: 6, repSeconds: 3.2, rangeM: 0.5, pauseSeconds: 1, seed })).toBe(6);
    }
  });

  it('sensore fermo: zero', () => {
    expect(count({ reps: 0, idleSeconds: 15 })).toBe(0);
  });
});
