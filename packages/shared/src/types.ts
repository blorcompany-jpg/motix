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
    /** Nome del personal trainer che ha creato il piano. */
    trainerName: string | null;
    weekStart: string;
    /** Numero progressivo del piano: sale a ogni nuova settimana o nuova versione. */
    version: number;
    rationale: string[];
    /** Cosa è cambiato rispetto alla settimana prima; vuoto se il piano è nuovo. */
    changes: string[];
    sessions: PlanSessionSummary[];
  } | null;
}

export interface SetLog {
  id: string;
  setNumber: number;
  reps: number;
  loadKg: number | null;
  source: 'manual' | 'sensor';
  /** Dati del sensore, se la serie è stata registrata con il motix pod. */
  sensor: SetSensorData | null;
}

export interface SetSensorData {
  /** Velocità media della fase di andata, in metri al secondo. */
  avgVelocity: number | null;
  peakVelocity: number | null;
  /** Da 0 a 100: quanto si somigliano le ripetizioni tra loro. */
  regularity: number | null;
  timeUnderTensionMs: number | null;
  /** Calo di velocità tra le prime ripetizioni e l'ultima, in percentuale. */
  velocityLossPct: number | null;
  rangeM: number | null;
}

export interface SensorView {
  id: string;
  serial: string;
  firmware: string | null;
  /** «mine»: abbinato al mio account; «structure»: messo a disposizione dalla mia struttura. */
  owner: 'mine' | 'structure';
  batteryPct: number | null;
  lastSeenAt: string | null;
}

export interface SensorsResponse {
  premium: boolean;
  sensors: SensorView[];
}

export interface SensorSetResponse {
  session: SessionDetail;
  analysis: SetSensorData & { reps: number };
}

export interface AdminSensor {
  id: string;
  serial: string;
  firmware: string | null;
  status: 'in_stock' | 'active' | 'faulty' | 'retired';
  ownerType: 'btech' | 'structure' | 'user';
  ownerName: string | null;
  freeOfCharge: boolean;
  batteryPct: number | null;
  lastSeenAt: string | null;
  pairedAt: string | null;
  note: string | null;
  openIssues: number;
}

export interface SensorIssueView {
  id: string;
  sensorId: string;
  serial: string;
  note: string;
  reporter: string | null;
  at: string;
  resolvedAt: string | null;
}

export interface StructureSensor {
  id: string;
  serial: string;
  status: 'in_stock' | 'active' | 'faulty' | 'retired';
  freeOfCharge: boolean;
  batteryPct: number | null;
  lastSeenAt: string | null;
  /** Serie registrate con questo sensore negli ultimi 30 giorni. */
  setsLast30Days: number;
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
    /** Medie delle serie fatte con il sensore, e velocità della volta precedente. */
    sensor: { sets: number; avgVelocity: number | null; regularity: number | null; velocityLossPct: number | null; previousAvgVelocity: number | null } | null;
  }>;
  /** Totali delle serie registrate con il sensore; null se non è stato usato. */
  sensor: { sets: number; avgVelocity: number | null; regularity: number | null; timeUnderTensionMs: number } | null;
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

/* ---------- Personal trainer e struttura ---------- */

export type RiskLevel = 'low' | 'medium' | 'high';

/** Rischio abbandono (sezione 8.4): punteggio, motivi e azione suggerita. */
export interface RiskInfo {
  level: RiskLevel;
  score: number;
  reasons: string[];
  suggestion: string | null;
}

export interface ClientReport {
  client: { id: string; firstName: string; lastName: string };
  profile: SportProfile | null;
  subscriptionStatus: SubscriptionStatus | null;
  risk: RiskInfo;
  lastSessionDay: string | null;
  weeks: Array<{ weekStart: string; sessions: number; volumeKg: number }>;
  sessions: Array<{ id: string; title: string; day: string; sets: number; volumeKg: number; perceivedEffort: number | null }>;
  strength: Array<{ exercise: string; firstKg: number; lastKg: number }>;
  weight: Array<{ day: string; weightKg: number }>;
  hydration: { averageMl: number; daysOnTarget: number; trackedDays: number };
  /** Dati del sensore nel periodo: quante serie e, per esercizio, com'è cambiata la velocità. */
  sensor: {
    sets: number;
    totalSets: number;
    exercises: Array<{ exercise: string; sets: number; firstVelocity: number | null; lastVelocity: number | null; regularity: number | null; lastLoadKg: number | null }>;
  };
}

export interface PlanEditorSession {
  title: string;
  day: string;
  exercises: Array<{ exerciseId: string; name: string; unit: 'reps' | 'seconds' | 'minutes'; loadable: boolean; sets: number; reps: number; loadKg: number | null; restSeconds: number }>;
}

export interface PlanEditorResponse {
  author: 'ai' | 'trainer' | null;
  note: string;
  sessions: PlanEditorSession[];
}

export interface ConversationSummary {
  id: string;
  with: { id: string; name: string; role: Role };
  lastMessage: { text: string; at: string; mine: boolean } | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  at: string;
  mine: boolean;
}

export interface MemberRow {
  id: string;
  sharesData: boolean;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  joinedAt: string | null;
  lastLoginAt: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  trainer: string | null;
  goal: Goal | null;
  sessions30d: number | null;
  lastSessionDay: string | null;
  risk: RiskInfo | null;
}

export interface StructureOverview {
  members: number;
  activeThisWeek: number;
  inTrial: number;
  subscribed: number;
  trainers: number;
  instructors: number;
  atRisk: number;
  avgSessionsPerWeek: number;
}

export interface StructureReportMonth {
  month: string;
  newMembers: number;
  activeMembers: number;
  sessions: number;
  trialsStarted: number;
  /** Quota degli iscritti attivi il mese prima che sono rimasti attivi. */
  retentionPct: number | null;
}

/* ---------- Community, shop, punti ---------- */

export interface MediaRef {
  id: string;
  url: string;
  type: 'image' | 'video';
}

export interface PostView {
  id: string;
  author: { id: string; name: string; role: Role; structure: string | null };
  text: string | null;
  media: { url: string; type: 'image' | 'video' } | null;
  visibility: 'structure' | 'global';
  createdAt: string;
  likes: number;
  liked: boolean;
  comments: number;
  mine: boolean;
}

export interface CommentView {
  id: string;
  author: { id: string; name: string };
  text: string;
  createdAt: string;
  mine: boolean;
}

export interface ProfileView {
  id: string;
  name: string;
  role: Role;
  structure: string | null;
  private: boolean;
  blocked: boolean;
  trainer: { id: string; specializations: string[]; bio: string | null } | null;
  stats: { sessions: number; posts: number } | null;
  posts: PostView[];
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  sessions: number;
  me: boolean;
}

export interface TrainerCard {
  trainerId: string;
  userId: string;
  name: string;
  specializations: string[];
  bio: string | null;
}

export type ShopCategory = 'sensor' | 'equipment' | 'apparel' | 'accessories';

export interface ShopProduct {
  id: string;
  name: string;
  category: ShopCategory;
  imageUrl: string | null;
}

export interface TrainerVideoView {
  id: string;
  title: string;
  url: string;
  visibility: 'clients' | 'community';
  reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  exercise: string | null;
  trainerName: string;
  createdAt: string;
}

export interface PointsResponse {
  balance: number;
  rules: { subscription: number; renewal: number };
  movements: Array<{ id: string; reason: 'subscription' | 'renewal' | 'bonus' | 'redemption' | 'adjustment'; points: number; balanceAfter: number; note: string | null; at: string }>;
  rewards: Array<{ id: string; name: string; description: string | null; pointsRequired: number; available: boolean }>;
  redemptions: Array<{ id: string; reward: string; points: number; status: 'requested' | 'approved' | 'rejected' | 'delivered'; at: string }>;
}
