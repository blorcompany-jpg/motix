/**
 * Collegamento al motore AI (services/ai). Il backend è l'unico a chiamarlo.
 * Se il motore non risponde le funzioni lanciano `AiUnavailable`: chi le usa decide come ripiegare.
 */
import type { Config } from '../config';

export interface SetSignal {
  sampleRateHz: number;
  ax: number[];
  ay: number[];
  az: number[];
}

export interface SetAnalysis {
  reps: number;
  quality: 'ok' | 'too_short' | 'no_movement';
  avgVelocity: number | null;
  peakVelocity: number | null;
  regularity: number | null;
  timeUnderTensionMs: number | null;
  velocityLossPct: number | null;
  rangeM: number | null;
  perRep: Array<{ startMs: number; durationMs: number; rangeM: number; velocity: number; peakVelocity: number }>;
}

export interface WeekInput {
  plannedSessions: number;
  completedSessions: number;
  efforts: number[];
  minor: boolean;
  exercises: Array<{
    key: string;
    name: string;
    unit: 'reps' | 'seconds' | 'minutes';
    loadable: boolean;
    sets: number;
    reps: number;
    loadKg: number | null;
    /** Le serie fatte in ogni seduta della settimana, dalla più vecchia. */
    sessions: Array<Array<{ reps: number; loadKg: number | null; velocityLossPct: number | null }>>;
  }>;
}

export interface WeekDecision {
  mode: 'progress' | 'hold' | 'deload';
  summary: string[];
  exercises: Array<{ key: string; action: 'increase' | 'hold' | 'decrease'; sets: number; reps: number; loadKg: number | null; reason: string }>;
}

export interface AiClient {
  analyzeSet(signal: SetSignal): Promise<SetAnalysis>;
  adaptWeek(week: WeekInput): Promise<WeekDecision>;
}

export class AiUnavailable extends Error {
  constructor(reason: string) {
    super(`Motore AI non raggiungibile: ${reason}`);
  }
}

export class HttpAiClient implements AiClient {
  constructor(
    private url: string,
    private key: string | null,
    private timeoutMs = 8000,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.key ? { 'x-motix-key': this.key } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new AiUnavailable(e instanceof Error ? e.message : 'errore di rete');
    }
    if (!res.ok) throw new AiUnavailable(`risposta ${res.status}`);
    return (await res.json()) as T;
  }

  analyzeSet(signal: SetSignal) {
    return this.post<SetAnalysis>('/v1/execution/set', signal);
  }

  adaptWeek(week: WeekInput) {
    return this.post<WeekDecision>('/v1/plan/adapt-week', week);
  }
}

/** Usato quando AI_URL non è impostata. */
export class NoAiClient implements AiClient {
  async analyzeSet(): Promise<SetAnalysis> {
    throw new AiUnavailable('AI_URL non impostata');
  }
  async adaptWeek(): Promise<WeekDecision> {
    throw new AiUnavailable('AI_URL non impostata');
  }
}

export const createAiClient = (config: Config): AiClient => (config.aiUrl ? new HttpAiClient(config.aiUrl, config.aiKey) : new NoAiClient());
