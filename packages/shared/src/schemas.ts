import { z } from 'zod';
import { ACQUISITION_CHANNELS, CONSENT_TYPES, STRUCTURE_TYPES } from './constants';

const email = z.string().trim().toLowerCase().email('Email non valida');
const password = z
  .string()
  .min(8, 'La password deve avere almeno 8 caratteri')
  .max(128, 'Password troppo lunga');
const name = z.string().trim().min(1, 'Campo obbligatorio').max(80);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida (AAAA-MM-GG)')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data non valida');

export const consentsSchema = z.object({
  terms: z.boolean(),
  health_data: z.boolean(),
  share_structure: z.boolean().default(false),
  share_trainer: z.boolean().default(false),
  marketing: z.boolean().default(false),
});
export type ConsentsInput = z.infer<typeof consentsSchema>;

export const parentSchema = z.object({ name, email });

/** Registrazione di chi si allena (app). */
export const registerUserSchema = z.object({
  email,
  password,
  firstName: name,
  lastName: name,
  birthDate: isoDate,
  consents: consentsSchema,
  /** Codice o QR della struttura: facoltativo. */
  structureCode: z.string().trim().toUpperCase().max(16).optional(),
  /** Codice di invito del personal trainer: facoltativo. */
  trainerCode: z.string().trim().toUpperCase().max(16).optional(),
  /** Codice dell'amico che ha invitato: facoltativo. */
  referralCode: z.string().trim().toUpperCase().max(16).optional(),
  /** Obbligatorio tra 14 e 17 anni. */
  parent: parentSchema.optional(),
  channel: z.enum(ACQUISITION_CHANNELS).optional(),
  campaign: z.string().trim().max(120).optional(),
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

/** Registrazione di un personal trainer (app o web). */
export const registerTrainerSchema = z.object({
  email,
  password,
  firstName: name,
  lastName: name,
  birthDate: isoDate,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Devi accettare i termini di servizio' }) }),
  specializations: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  bio: z.string().trim().max(600).optional(),
  /** Codice di una struttura con cui collabora: facoltativo. */
  structureCode: z.string().trim().toUpperCase().max(16).optional(),
});
export type RegisterTrainerInput = z.infer<typeof registerTrainerSchema>;

/** Affiliazione di una struttura: crea il titolare e la struttura, in attesa di approvazione. */
export const registerStructureSchema = z.object({
  owner: z.object({ email, password, firstName: name, lastName: name }),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Devi accettare le condizioni di affiliazione' }) }),
  structure: z.object({
    legalName: z.string().trim().min(2).max(160),
    displayName: z.string().trim().min(2).max(80),
    type: z.enum(STRUCTURE_TYPES),
    vatNumber: z.string().trim().max(20).optional(),
    address: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(80),
    province: z.string().trim().toUpperCase().length(2, 'Sigla della provincia, es. BA'),
    phone: z.string().trim().max(30).optional(),
    membersEstimate: z.number().int().min(0).max(100000).optional(),
  }),
});
export type RegisterStructureInput = z.infer<typeof registerStructureSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1, 'Inserisci la password') });
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20) });

export const updateConsentsSchema = z
  .object(Object.fromEntries(CONSENT_TYPES.map((t) => [t, z.boolean().optional()])) as Record<
    (typeof CONSENT_TYPES)[number],
    z.ZodOptional<z.ZodBoolean>
  >)
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nessun consenso indicato');

export const codeSchema = z.object({ code: z.string().trim().toUpperCase().min(4).max(16) });

export const inviteStaffSchema = z.object({
  email,
  role: z.enum(['instructor', 'personal_trainer']),
  firstName: name.optional(),
  lastName: name.optional(),
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const acceptStaffInviteSchema = z.object({
  token: z.string().min(20),
  password,
  firstName: name,
  lastName: name,
});

export const inviteClientSchema = z.object({ email });

export const decisionSchema = z.object({ reason: z.string().trim().max(400).optional() });

/* ---------- App utente ---------- */
import { CONTAINERS, EQUIPMENT, GOALS, LEVELS, LIMITATIONS, SEXES } from './constants';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida');

export const sportProfileSchema = z.object({
  sex: z.enum(SEXES),
  weightKg: z.number().min(30, 'Peso non valido').max(250, 'Peso non valido'),
  heightCm: z.number().int().min(120, 'Altezza non valida').max(230, 'Altezza non valida'),
  goal: z.enum(GOALS),
  level: z.enum(LEVELS),
  daysPerWeek: z.number().int().min(1).max(6),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length),
  limitations: z.array(z.enum(LIMITATIONS)).max(LIMITATIONS.length),
});
export type SportProfileInput = z.infer<typeof sportProfileSchema>;

export const daySchema = z.object({ day });

export const logSetSchema = z.object({
  sessionExerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(20),
  reps: z.number().int().min(0).max(200),
  loadKg: z.number().min(0).max(500).nullable().optional(),
});

export const completeSessionSchema = z.object({
  perceivedEffort: z.number().int().min(1).max(10),
  notes: z.string().trim().max(500).optional(),
});

export const freeSessionSchema = z.object({
  day,
  title: z.string().trim().min(1).max(60).optional(),
  exerciseIds: z.array(z.string().uuid()).min(1).max(12),
});

export const hydrationLogSchema = z.object({
  day,
  container: z.enum(CONTAINERS),
});

export const measurementSchema = z.object({
  day,
  weightKg: z.number().min(30).max(250).optional(),
  circumferences: z.record(z.string().max(20), z.number().min(10).max(250)).optional(),
});

/* ---------- Personal trainer e struttura ---------- */

export const trainerPlanSchema = z.object({
  /** Nota del personal trainer, mostrata al cliente in «Perché questo piano». */
  note: z.string().trim().max(600).optional(),
  sessions: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Dai un nome alla seduta').max(60),
        day,
        exercises: z
          .array(
            z.object({
              exerciseId: z.string().uuid(),
              sets: z.number().int().min(1).max(10),
              reps: z.number().int().min(1).max(200),
              loadKg: z.number().min(0).max(500).nullable().optional(),
              restSeconds: z.number().int().min(0).max(600),
            }),
          )
          .min(1, 'Aggiungi almeno un esercizio')
          .max(15),
      }),
    )
    .min(1, 'Aggiungi almeno una seduta')
    .max(7),
});
export type TrainerPlanInput = z.infer<typeof trainerPlanSchema>;

export const messageSchema = z.object({ text: z.string().trim().min(1, 'Scrivi un messaggio').max(2000) });

export const noteSchema = z.object({ text: z.string().trim().min(1, 'Scrivi una nota').max(1000) });

export const campaignSchema = z.object({
  text: z.string().trim().min(1, 'Scrivi un messaggio').max(2000),
  /** A chi inviare: iscritti scelti a mano oppure un gruppo. */
  userIds: z.array(z.string().uuid()).max(2000).optional(),
  segment: z.enum(['all', 'at_risk', 'trial', 'inactive']).optional(),
});
