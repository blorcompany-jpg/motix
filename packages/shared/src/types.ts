import type { ConsentType, Role, StructureType } from './constants';

export type UserStatus = 'active' | 'pending_parental_consent' | 'suspended' | 'deleted';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'expired' | 'free';
export type ClientLinkStatus = 'requested_by_user' | 'requested_by_trainer' | 'active' | 'declined' | 'closed';

export interface StructureSummary {
  id: string;
  displayName: string;
  city: string;
  type: StructureType;
}

export interface MeResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  birthDate: string | null;
  profileVisibility: 'private' | 'public';
  referralCode: string | null;
  consents: Record<ConsentType, boolean>;
  structure: StructureSummary | null;
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    trialDaysLeft: number | null;
    firstChargeAt: string | null;
  } | null;
  trainer: { id: string; status: ApprovalStatus; inviteCode: string; pointsBalance: number } | null;
  ownedStructure: (StructureSummary & { status: ApprovalStatus; code: string | null }) | null;
  instructorOf: StructureSummary | null;
  /** Funzioni Premium attive: prova in corso o abbonamento attivo. */
  premium: boolean;
  /** Questionario iniziale compilato. */
  hasProfile: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: MeResponse;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

/* ---------- App utente ---------- */
import type { Container, Goal, Level, Limitation, Muscle, Sex } from './constants';

export interface SportProfile {
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  goal: Goal | null;
  level: Level | null;
  daysPerWeek: number | null;
  equipment: string[];
  limitations: Limitation[];
}

export interface PlanSessionSummary {
  id: string;
  title: string;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  exerciseCount: number;
  estimatedMinutes: number;
  muscles: Muscle[];
}

export interface PlanResponse {
  plan: {
    id: string;
    author: 'ai' | 'trainer';
    weekStart: string;
    rationale: string[];
    sessions: PlanSessionSummary[];
  } | null;
}

export interface SetLog {
  id: string;
  setNumber: number;
  reps: number;
  loadKg: number | null;
  source: 'manual' | 'sensor';
}

export interface SessionExerciseDetail {
  id: string;
  position: number;
  exercise: { id: string; name: string; description: string | null; muscles: Muscle[]; loadable: boolean; unit: 'reps' | 'seconds' | 'minutes'; videoUrl: string | null };
  targetSets: number;
  targetReps: number;
  targetLoadKg: number | null;
  restSeconds: number;
  logs: SetLog[];
  /** Ultima volta che l'utente ha fatto questo esercizio. */
  previous: { day: string; sets: Array<{ reps: number; loadKg: number | null }> } | null;
}

export interface SessionDetail {
  id: string;
  title: string;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  perceivedEffort: number | null;
  exercises: SessionExerciseDetail[];
}

export type Trend = 'up' | 'same' | 'down' | 'new';

export interface SessionSummary {
  sessionId: string;
  title: string;
  day: string;
  durationMin: number | null;
  perceivedEffort: number | null;
  totals: { sets: number; reps: number; volumeKg: number };
  /** Confronto con la seduta precedente dello stesso tipo. */
  previous: { day: string; volumeKg: number; reps: number; volumeDeltaPct: number | null } | null;
  /** Confronto con la settimana prima. */
  week: { sessionsThisWeek: number; sessionsLastWeek: number; volumeThisWeek: number; volumeLastWeek: number };
  exercises: Array<{
    name: string;
    sets: number;
    reps: number;
    bestLoadKg: number | null;
    previous: { reps: number; bestLoadKg: number | null } | null;
    trend: Trend;
  }>;
  tips: string[];
}

export interface HydrationDay {
  day: string;
  goalMl: number;
  totalMl: number;
  personalized: boolean;
  logs: Array<{ id: string; container: Container; amountMl: number; loggedAt: string }>;
}

export interface HomeResponse {
  premium: boolean;
  trialDaysLeft: number | null;
  session: PlanSessionSummary | null;
  /** true se la seduta proposta è di oggi, false se è la prossima in programma. */
  sessionIsToday: boolean;
  hydration: { goalMl: number; totalMl: number };
  streakDays: number;
  tip: string;
  hasPlan: boolean;
}

export interface ProgressResponse {
  days: number;
  /** true nella versione gratuita: storico limitato agli ultimi 7 giorni. */
  limited: boolean;
  streakDays: number;
  weeks: Array<{ weekStart: string; sessions: number; volumeKg: number }>;
  muscles: Array<{ muscle: Muscle; sets: number }>;
  strength: Array<{ exercise: string; points: Array<{ day: string; bestLoadKg: number }> }>;
  weight: Array<{ day: string; weightKg: number }>;
  /** Media e giorni a obiettivo contano dal primo giorno in cui l'utente ha registrato l'acqua. */
  hydration: { averageMl: number; daysOnTarget: number; trackedDays: number; days: Array<{ day: string; totalMl: number; goalMl: number }> };
}

export interface SubscriptionResponse {
  status: SubscriptionStatus;
  premium: boolean;
  /** Prova disdetta: resta Premium fino alla fine della prova, poi versione gratuita senza addebiti. */
  cancelled: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  firstChargeAt: string | null;
  commitmentEndsAt: string | null;
  installmentsPaid: number;
  installmentsTotal: number;
  priceMonthlyEur: number;
}
