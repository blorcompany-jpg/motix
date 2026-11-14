/**
 * Schema del database MOTIX (PostgreSQL).
 * Segue la sezione 10 «Modello dei dati» del documento di progetto.
 * Identificatori in inglese; i testi mostrati alle persone sono in italiano.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  type AnyPgColumn,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

/* ---------- Enumerazioni ---------- */

export const roleEnum = pgEnum('role', ['user', 'personal_trainer', 'owner', 'instructor', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'pending_parental_consent', 'suspended', 'deleted']);
export const authProviderEnum = pgEnum('auth_provider', ['email', 'apple', 'google']);
export const sexEnum = pgEnum('sex', ['female', 'male', 'other', 'undisclosed']);
export const visibilityEnum = pgEnum('profile_visibility', ['private', 'public']);
export const channelEnum = pgEnum('acquisition_channel', ['structure', 'trainer', 'ads', 'organic']);
export const consentTypeEnum = pgEnum('consent_type', ['terms', 'health_data', 'share_structure', 'share_trainer', 'marketing']);
export const parentalStatusEnum = pgEnum('parental_consent_status', ['pending', 'confirmed', 'rejected', 'expired']);
export const goalEnum = pgEnum('goal', ['lose_weight', 'tone', 'strength', 'endurance', 'health']);
export const levelEnum = pgEnum('level', ['beginner', 'intermediate', 'advanced']);
export const structureTypeEnum = pgEnum('structure_type', ['gym', 'asd', 'ssd', 'other']);
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'suspended']);
export const trainerStructureStatusEnum = pgEnum('trainer_structure_status', ['invited_by_structure', 'requested_by_trainer', 'active', 'closed']);
export const staffRoleEnum = pgEnum('staff_role', ['instructor', 'personal_trainer']);
export const inviteStatusEnum = pgEnum('invite_status', ['pending', 'accepted', 'expired', 'cancelled']);
export const clientLinkStatusEnum = pgEnum('client_link_status', ['requested_by_user', 'requested_by_trainer', 'active', 'declined', 'closed']);
export const exerciseSourceEnum = pgEnum('exercise_source', ['ai', 'team', 'trainer']);
export const reviewStatusEnum = pgEnum('review_status', ['draft', 'pending', 'approved', 'rejected']);
export const videoVisibilityEnum = pgEnum('video_visibility', ['clients', 'community']);
export const planAuthorEnum = pgEnum('plan_author', ['ai', 'trainer']);
export const planStatusEnum = pgEnum('plan_status', ['active', 'archived']);
export const setSourceEnum = pgEnum('set_source', ['manual', 'sensor']);
export const sensorOwnerEnum = pgEnum('sensor_owner', ['btech', 'structure', 'user']);
export const sensorStatusEnum = pgEnum('sensor_status', ['in_stock', 'active', 'faulty', 'retired']);
export const containerEnum = pgEnum('hydration_container', ['glass', 'bottle_05', 'bottle_1', 'bottle_15', 'flask_05', 'custom']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trial', 'active', 'cancelled', 'expired', 'free']);
export const storeEnum = pgEnum('store', ['app_store', 'google_play']);
export const mediaTypeEnum = pgEnum('media_type', ['video', 'image']);
export const postVisibilityEnum = pgEnum('post_visibility', ['structure', 'global']);
export const moderationStatusEnum = pgEnum('moderation_status', ['pending', 'approved', 'removed']);
export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'group']);
export const reportTargetEnum = pgEnum('report_target', ['post', 'comment', 'message', 'user', 'trainer_video']);
export const reportOutcomeEnum = pgEnum('report_outcome', ['pending', 'dismissed', 'removed', 'suspended']);
export const pointReasonEnum = pgEnum('point_reason', ['subscription', 'renewal', 'bonus', 'redemption', 'adjustment']);
export const redemptionStatusEnum = pgEnum('redemption_status', ['requested', 'approved', 'rejected', 'delivered']);
export const shopCategoryEnum = pgEnum('shop_category', ['sensor', 'equipment', 'apparel', 'accessories']);
export const referralStatusEnum = pgEnum('referral_status', ['pending', 'rewarded', 'void']);
export const platformEnum = pgEnum('device_platform', ['ios', 'android', 'web']);

/* ---------- Strutture ---------- */

export const structures = pgTable(
  'structures',
  {
    id: id(),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name').notNull(),
    type: structureTypeEnum('type').notNull(),
    vatNumber: text('vat_number'),
    address: text('address'),
    city: text('city').notNull(),
    province: text('province').notNull(),
    phone: text('phone'),
    membersEstimate: integer('members_estimate'),
    /** Codice per gli iscritti (anche in QR). Assegnato all'approvazione. */
    code: text('code'),
    status: approvalStatusEnum('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    ownerUserId: uuid('owner_user_id').notNull().references((): AnyPgColumn => users.id),
    pilot: boolean('pilot').notNull().default(false),
    commercialNotes: text('commercial_notes'),
    affiliatedAt: ts('affiliated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('structures_code_uq').on(t.code), index('structures_status_idx').on(t.status)],
);

/* ---------- Utenti e accesso ---------- */

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    authProvider: authProviderEnum('auth_provider').notNull().default('email'),
    providerSubject: text('provider_subject'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    birthDate: date('birth_date'),
    sex: sexEnum('sex'),
    role: roleEnum('role').notNull().default('user'),
    status: userStatusEnum('status').notNull().default('active'),
    profileVisibility: visibilityEnum('profile_visibility').notNull().default('private'),
    avatarUrl: text('avatar_url'),
    /** Al massimo una struttura alla volta. */
    structureId: uuid('structure_id').references(() => structures.id, { onDelete: 'set null' }),
    structureJoinedAt: ts('structure_joined_at'),
    acquisitionChannel: channelEnum('acquisition_channel').notNull().default('organic'),
    acquisitionCampaign: text('acquisition_campaign'),
    referralCode: text('referral_code'),
    emailVerifiedAt: ts('email_verified_at'),
    lastLoginAt: ts('last_login_at'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    uniqueIndex('users_referral_code_uq').on(t.referralCode),
    index('users_structure_idx').on(t.structureId),
    index('users_role_idx').on(t.role),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_user_idx').on(t.userId)],
);

export const emailTokenPurposeEnum = pgEnum('email_token_purpose', ['verify_email', 'reset_password']);

/** Token monouso inviati per email: verifica dell'indirizzo e nuova password. */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('email_tokens_hash_uq').on(t.tokenHash)],
);

export const userConsents = pgTable(
  'user_consents',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: consentTypeEnum('type').notNull(),
    granted: boolean('granted').notNull(),
    version: text('version').notNull().default('1'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const parentalConsents = pgTable(
  'parental_consents',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    parentName: text('parent_name').notNull(),
    parentEmail: text('parent_email').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: parentalStatusEnum('status').notNull().default('pending'),
    method: text('method').notNull().default('email_link'),
    requestedAt: ts('requested_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    decidedAt: ts('decided_at'),
    decidedIp: text('decided_ip'),
  },
  (t) => [uniqueIndex('parental_consents_user_uq').on(t.userId), uniqueIndex('parental_consents_token_uq').on(t.tokenHash)],
);

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    token: text('token').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('device_tokens_token_uq').on(t.token)],
);

/** Registro delle azioni sensibili e degli accessi ai dati (GDPR). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    ip: text('ip'),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_actor_idx').on(t.actorUserId), index('audit_log_entity_idx').on(t.entity, t.entityId)],
);

/* ---------- Profilo sportivo ---------- */

export const sportProfiles = pgTable('sport_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  weightKg: numeric('weight_kg', { precision: 5, scale: 1 }),
  heightCm: integer('height_cm'),
  goal: goalEnum('goal'),
  level: levelEnum('level'),
  daysPerWeek: integer('days_per_week'),
  equipment: jsonb('equipment').$type<string[]>().notNull().default([]),
  limitations: jsonb('limitations').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  updatedAt: updatedAt(),
});

/* ---------- Personal trainer, istruttori, collegamenti ---------- */

export const trainers = pgTable(
  'trainers',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    specializations: jsonb('specializations').$type<string[]>().notNull().default([]),
    bio: text('bio'),
    inviteCode: text('invite_code').notNull(),
    publicProfile: boolean('public_profile').notNull().default(true),
    status: approvalStatusEnum('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    pointsBalance: integer('points_balance').notNull().default(0),
    approvedAt: ts('approved_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('trainers_user_uq').on(t.userId), uniqueIndex('trainers_invite_code_uq').on(t.inviteCode)],
);

/** Un personal trainer può lavorare con più strutture. */
export const trainerStructures = pgTable(
  'trainer_structures',
  {
    trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
    structureId: uuid('structure_id').notNull().references(() => structures.id, { onDelete: 'cascade' }),
    status: trainerStructureStatusEnum('status').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.trainerId, t.structureId] })],
);

export const instructors = pgTable(
  'instructors',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    structureId: uuid('structure_id').notNull().references(() => structures.id, { onDelete: 'cascade' }),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('instructors_user_uq').on(t.userId), index('instructors_structure_idx').on(t.structureId)],
);

/** Iscritti assegnati a un istruttore. */
export const instructorAssignments = pgTable(
  'instructor_assignments',
  {
    instructorId: uuid('instructor_id').notNull().references(() => instructors.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.instructorId, t.userId] })],
);

/** Inviti della struttura a istruttori e personal trainer non ancora registrati. */
export const staffInvites = pgTable(
  'staff_invites',
  {
    id: id(),
    structureId: uuid('structure_id').notNull().references(() => structures.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: staffRoleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: inviteStatusEnum('status').notNull().default('pending'),
    invitedBy: uuid('invited_by').notNull().references(() => users.id),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('staff_invites_token_uq').on(t.tokenHash), index('staff_invites_structure_idx').on(t.structureId)],
);

/** Collegamento cliente ↔ personal trainer: attivo solo dopo l'accettazione. */
export const clientLinks = pgTable(
  'client_links',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
    status: clientLinkStatusEnum('status').notNull(),
    dataConsent: boolean('data_consent').notNull().default(false),
    startedAt: ts('started_at'),
    closedAt: ts('closed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('client_links_user_idx').on(t.userId), index('client_links_trainer_idx').on(t.trainerId)],
);

/** Note del CRM: appunti dello staff della struttura su un iscritto. */
export const memberNotes = pgTable(
  'member_notes',
  {
    id: id(),
    structureId: uuid('structure_id').notNull().references(() => structures.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('member_notes_member_idx').on(t.structureId, t.userId)],
);

/* ---------- Esercizi, piani, sedute ---------- */

export const exercises = pgTable(
  'exercises',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    videoUrl: text('video_url'),
    muscles: jsonb('muscles').$type<string[]>().notNull().default([]),
    equipment: jsonb('equipment').$type<string[]>().notNull().default([]),
    level: levelEnum('level').notNull().default('beginner'),
    /** Schema di movimento usato dal generatore del piano (squat, hinge, push_h…). */
    pattern: text('pattern').notNull().default('other'),
    /** false per gli esercizi a corpo libero o a tempo, dove il carico non si registra. */
    loadable: boolean('loadable').notNull().default(true),
    /** Come si conta: ripetizioni, secondi di tenuta o minuti. */
    unit: text('unit').notNull().default('reps'),
    contraindications: jsonb('contraindications').$type<string[]>().notNull().default([]),
    source: exerciseSourceEnum('source').notNull().default('ai'),
    reviewStatus: reviewStatusEnum('review_status').notNull().default('draft'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('exercises_slug_uq').on(t.slug)],
);

/** Video caricati dai personal trainer, per i clienti o per la community. */
export const trainerVideos = pgTable(
  'trainer_videos',
  {
    id: id(),
    trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    videoUrl: text('video_url').notNull(),
    visibility: videoVisibilityEnum('visibility').notNull().default('clients'),
    reviewStatus: reviewStatusEnum('review_status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [index('trainer_videos_trainer_idx').on(t.trainerId)],
);

export const plans = pgTable(
  'plans',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    author: planAuthorEnum('author').notNull(),
    authorTrainerId: uuid('author_trainer_id').references(() => trainers.id, { onDelete: 'set null' }),
    weekStart: date('week_start').notNull(),
    version: integer('version').notNull().default(1),
    rationale: text('rationale'),
    status: planStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [index('plans_user_idx').on(t.userId, t.weekStart)],
);

export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: id(),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    scheduledDate: date('scheduled_date').notNull(),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    perceivedEffort: integer('perceived_effort'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('workout_sessions_user_idx').on(t.userId, t.scheduledDate)],
);

export const sessionExercises = pgTable(
  'session_exercises',
  {
    id: id(),
    sessionId: uuid('session_id').notNull().references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').notNull().references(() => exercises.id),
    trainerVideoId: uuid('trainer_video_id').references(() => trainerVideos.id, { onDelete: 'set null' }),
    position: integer('position').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetReps: integer('target_reps').notNull(),
    targetLoadKg: numeric('target_load_kg', { precision: 6, scale: 2 }),
    restSeconds: integer('rest_seconds'),
  },
  (t) => [index('session_exercises_session_idx').on(t.sessionId)],
);

/* ---------- Sensore motix pod ---------- */

export const sensors = pgTable(
  'sensors',
  {
    id: id(),
    serial: text('serial').notNull(),
    firmware: text('firmware'),
    ownerType: sensorOwnerEnum('owner_type').notNull().default('btech'),
    ownerStructureId: uuid('owner_structure_id').references(() => structures.id, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Sensori dati gratuitamente alle strutture affiliate. */
    freeOfCharge: boolean('free_of_charge').notNull().default(false),
    status: sensorStatusEnum('status').notNull().default('in_stock'),
    pairedAt: ts('paired_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sensors_serial_uq').on(t.serial)],
);

/** Una riga per ogni serie eseguita, registrata a mano o letta dal sensore. */
export const setLogs = pgTable(
  'set_logs',
  {
    id: id(),
    sessionExerciseId: uuid('session_exercise_id').notNull().references(() => sessionExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    reps: integer('reps').notNull(),
    loadKg: numeric('load_kg', { precision: 6, scale: 2 }),
    source: setSourceEnum('source').notNull().default('manual'),
    recordedAt: ts('recorded_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('set_logs_set_uq').on(t.sessionExerciseId, t.setNumber)],
);

/** Dati del sensore per una serie: velocità, regolarità, tempo sotto tensione. */
export const sensorReadings = pgTable(
  'sensor_readings',
  {
    id: id(),
    setLogId: uuid('set_log_id').notNull().references(() => setLogs.id, { onDelete: 'cascade' }),
    sensorId: uuid('sensor_id').references(() => sensors.id, { onDelete: 'set null' }),
    reps: integer('reps').notNull(),
    avgVelocity: numeric('avg_velocity', { precision: 6, scale: 3 }),
    regularity: numeric('regularity', { precision: 5, scale: 2 }),
    timeUnderTensionMs: integer('time_under_tension_ms'),
    perRep: jsonb('per_rep').$type<Array<{ velocity: number; durationMs: number }>>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sensor_readings_set_uq').on(t.setLogId)],
);

/* ---------- Idratazione e misure ---------- */

export const hydrationLogs = pgTable(
  'hydration_logs',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    loggedAt: ts('logged_at').notNull().defaultNow(),
    /** Giorno locale dell'utente, per i totali giornalieri. */
    day: date('day').notNull(),
    container: containerEnum('container').notNull(),
    amountMl: integer('amount_ml').notNull(),
  },
  (t) => [index('hydration_logs_user_idx').on(t.userId, t.day)],
);

export const hydrationGoals = pgTable(
  'hydration_goals',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    goalMl: integer('goal_ml').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const measurements = pgTable(
  'measurements',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    weightKg: numeric('weight_kg', { precision: 5, scale: 1 }),
    circumferences: jsonb('circumferences').$type<Record<string, number>>(),
    healthData: jsonb('health_data').$type<Record<string, number>>(),
    createdAt: createdAt(),
  },
  (t) => [index('measurements_user_idx').on(t.userId, t.day)],
);

/* ---------- Abbonamento ---------- */

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: subscriptionStatusEnum('status').notNull(),
    trialStartedAt: ts('trial_started_at'),
    trialEndsAt: ts('trial_ends_at'),
    firstChargeAt: ts('first_charge_at'),
    commitmentEndsAt: ts('commitment_ends_at'),
    installmentsPaid: integer('installments_paid').notNull().default(0),
    store: storeEnum('store'),
    storeTransactionId: text('store_transaction_id'),
    cancelledAt: ts('cancelled_at'),
    renewedFromId: uuid('renewed_from_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_user_idx').on(t.userId), index('subscriptions_status_idx').on(t.status)],
);

export const referrals = pgTable(
  'referrals',
  {
    id: id(),
    referrerUserId: uuid('referrer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    referredUserId: uuid('referred_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: referralStatusEnum('status').notNull().default('pending'),
    rewardedAt: ts('rewarded_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('referrals_referred_uq').on(t.referredUserId)],
);

export const riskScores = pgTable(
  'risk_scores',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    value: numeric('value', { precision: 4, scale: 3 }).notNull(),
    reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
  },
  (t) => [uniqueIndex('risk_scores_user_day_uq').on(t.userId, t.day)],
);

/** File caricati dagli utenti (foto e video). `key` è il nome nell'archivio dei file. */
export const mediaFiles = pgTable(
  'media_files',
  {
    id: id(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    kind: mediaTypeEnum('kind').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('media_files_key_uq').on(t.key), index('media_files_owner_idx').on(t.ownerId)],
);

/** Impostazioni modificabili da BTECH dal pannello (es. valore dei punti). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
});

/* ---------- Community ---------- */

export const posts = pgTable(
  'posts',
  {
    id: id(),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mediaUrl: text('media_url'),
    mediaType: mediaTypeEnum('media_type'),
    text: text('text'),
    visibility: postVisibilityEnum('visibility').notNull().default('structure'),
    structureId: uuid('structure_id').references(() => structures.id, { onDelete: 'set null' }),
    moderationStatus: moderationStatusEnum('moderation_status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [index('posts_feed_idx').on(t.visibility, t.createdAt), index('posts_structure_idx').on(t.structureId, t.createdAt)],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const postComments = pgTable(
  'post_comments',
  {
    id: id(),
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('post_comments_post_idx').on(t.postId)],
);

export const conversations = pgTable('conversations', {
  id: id(),
  type: conversationTypeEnum('type').notNull().default('direct'),
  title: text('title'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: ts('last_read_at'),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    text: text('text'),
    attachments: jsonb('attachments').$type<Array<{ url: string; type: string }>>(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    targetType: reportTargetEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason').notNull(),
    outcome: reportOutcomeEnum('outcome').notNull().default('pending'),
    handledBy: uuid('handled_by').references(() => users.id),
    handledAt: ts('handled_at'),
    createdAt: createdAt(),
  },
  (t) => [index('reports_outcome_idx').on(t.outcome)],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/* ---------- Sfide e badge ---------- */

export const challenges = pgTable('challenges', {
  id: id(),
  structureId: uuid('structure_id').references(() => structures.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('14_days'),
  targetSessions: integer('target_sessions'),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  createdAt: createdAt(),
});

export const challengeParticipants = pgTable(
  'challenge_participants',
  {
    challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    progress: integer('progress').notNull().default(0),
    completedAt: ts('completed_at'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.challengeId, t.userId] })],
);

export const badges = pgTable(
  'badges',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
  },
  (t) => [uniqueIndex('badges_code_uq').on(t.code)],
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
    earnedAt: ts('earned_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

/* ---------- Punti e premi dei personal trainer ---------- */

export const pointMovements = pgTable(
  'point_movements',
  {
    id: id(),
    trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
    reason: pointReasonEnum('reason').notNull(),
    points: integer('points').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('point_movements_trainer_idx').on(t.trainerId, t.createdAt)],
);

export const rewards = pgTable('rewards', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  pointsRequired: integer('points_required').notNull(),
  stock: integer('stock'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: id(),
    rewardId: uuid('reward_id').notNull().references(() => rewards.id),
    trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'cascade' }),
    points: integer('points').notNull(),
    status: redemptionStatusEnum('status').notNull().default('requested'),
    handledBy: uuid('handled_by').references(() => users.id),
    handledAt: ts('handled_at'),
    createdAt: createdAt(),
  },
  (t) => [index('reward_redemptions_trainer_idx').on(t.trainerId)],
);

/* ---------- Shop by BLOR ---------- */

export const shopProducts = pgTable('shop_products', {
  id: id(),
  name: text('name').notNull(),
  category: shopCategoryEnum('category').notNull(),
  imageUrl: text('image_url'),
  /** Pagina del prodotto sullo shop di BLOR Company, dove avviene l'acquisto. */
  blorUrl: text('blor_url').notNull(),
  position: integer('position').notNull().default(0),
  visible: boolean('visible').notNull().default(true),
  createdAt: createdAt(),
});

/* ---------- Analytics ---------- */

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
    userId: uuid('user_id'),
    structureId: uuid('structure_id'),
    trainerId: uuid('trainer_id'),
    channel: channelEnum('channel'),
    data: jsonb('data').$type<Record<string, unknown>>(),
  },
  (t) => [index('analytics_events_type_idx').on(t.type, t.occurredAt), index('analytics_events_structure_idx').on(t.structureId)],
);
