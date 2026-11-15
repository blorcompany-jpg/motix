/**
 * Backend e motore AI insieme: avvia il servizio Python vero e lo chiama come fa il server.
 * Se Python o le sue librerie non sono installati, la prova viene saltata (in CI sono installati).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simulatePodSet } from '@motix/shared';
import { AiUnavailable, HttpAiClient } from '../src/lib/ai';

const dir = path.resolve(__dirname, '../../../services/ai');
const available = spawnSync('python3', ['-c', 'import fastapi, uvicorn, scipy'], { cwd: dir }).status === 0;
const PORT = 48231;
const KEY = 'chiave-di-prova';
let server: ChildProcess;
const ai = new HttpAiClient(`http://127.0.0.1:${PORT}`, KEY);

describe.skipIf(!available)('motore AI vero', () => {
  beforeAll(async () => {
    server = spawn('python3', ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: dir, env: { ...process.env, AI_SERVICE_KEY: KEY }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    throw new Error('Il motore AI non è partito');
  }, 30_000);
  afterAll(() => { server?.kill(); });

  it('conta le ripetizioni di una serie simulata dall’app', async () => {
    const result = await ai.analyzeSet(simulatePodSet({ reps: 9, repSeconds: 2.2, rangeM: 0.4 }));
    expect(result).toMatchObject({ reps: 9, quality: 'ok' });
    expect(result.avgVelocity).toBeGreaterThan(0.3);
    expect(result.avgVelocity).toBeLessThan(0.45);
    expect(result.regularity).toBeGreaterThan(85);
    expect(result.perRep).toHaveLength(9);
  });

  it('vede la fatica: le ultime ripetizioni più lente', async () => {
    const result = await ai.analyzeSet(simulatePodSet({ reps: 8, repSeconds: [2, 2, 2.1, 2.2, 2.4, 2.7, 3.1, 3.6] }));
    expect(result.reps).toBe(8);
    expect(result.velocityLossPct).toBeGreaterThan(30);
  });

  it('sensore fermo: nessuna ripetizione', async () => {
    expect(await ai.analyzeSet(simulatePodSet({ reps: 0, idleSeconds: 10 }))).toMatchObject({ reps: 0, quality: 'no_movement' });
  });

  it('propone l’adattamento della settimana', async () => {
    const set = { reps: 10, loadKg: 40, velocityLossPct: null };
    const decision = await ai.adaptWeek({
      plannedSessions: 3,
      completedSessions: 3,
      efforts: [7, 6, 7],
      minor: false,
      exercises: [
        { key: '0:1', name: 'Panca piana', unit: 'reps', loadable: true, sets: 3, reps: 10, loadKg: 40, sessions: [[set, set, set]] },
        { key: '0:2', name: 'Plank', unit: 'seconds', loadable: false, sets: 3, reps: 30, loadKg: null, sessions: [] },
      ],
    });
    expect(decision.mode).toBe('progress');
    expect(decision.exercises).toEqual([
      { key: '0:1', action: 'increase', sets: 3, reps: 10, loadKg: 42, reason: 'Tutte le ripetizioni completate, da 40 kg a 42 kg.' },
      { key: '0:2', action: 'hold', sets: 3, reps: 30, loadKg: null, reason: 'Non eseguito la settimana scorsa, resta uguale.' },
    ]);
  });

  it('senza chiave o con il servizio spento risponde «non disponibile»', async () => {
    await expect(new HttpAiClient(`http://127.0.0.1:${PORT}`, null).analyzeSet(simulatePodSet({ reps: 2 }))).rejects.toBeInstanceOf(AiUnavailable);
    await expect(new HttpAiClient('http://127.0.0.1:9', KEY, 500).adaptWeek({ plannedSessions: 0, completedSessions: 0, efforts: [], minor: false, exercises: [] })).rejects.toBeInstanceOf(AiUnavailable);
  });
});
