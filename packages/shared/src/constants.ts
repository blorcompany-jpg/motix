/** Regole di business (sezione 3 del documento di progetto). */
export const TRIAL_DAYS = 14;
export const COMMITMENT_MONTHS = 12;
export const PRICE_MONTHLY_EUR = 4.99; // IVA inclusa
export const MIN_AGE = 14;
export const ADULT_AGE = 18;

export const ROLES = ['user', 'personal_trainer', 'owner', 'instructor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: 'Utente',
  personal_trainer: 'Personal trainer',
  owner: 'Titolare della struttura',
  instructor: 'Istruttore',
  admin: 'Amministratore BTECH',
};

export const CONSENT_TYPES = ['terms', 'health_data', 'share_structure', 'share_trainer', 'marketing'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_LABELS: Record<ConsentType, string> = {
  terms: 'Termini di servizio e informativa privacy',
  health_data: 'Trattamento dei dati sulla salute',
  share_structure: 'Condivisione dei dati con la mia struttura',
  share_trainer: 'Condivisione dei dati con il mio personal trainer',
  marketing: 'Comunicazioni di marketing',
};

/** Consensi senza i quali l'account non può essere creato. */
export const REQUIRED_CONSENTS: ConsentType[] = ['terms', 'health_data'];

export const STRUCTURE_TYPES = ['gym', 'asd', 'ssd', 'other'] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];
export const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  gym: 'Palestra / centro fitness',
  asd: 'ASD',
  ssd: 'SSD',
  other: 'Altro',
};

export const ACQUISITION_CHANNELS = ['structure', 'trainer', 'ads', 'organic'] as const;
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

/* ---------- Profilo sportivo (questionario iniziale) ---------- */

export const GOALS = ['lose_weight', 'tone', 'strength', 'endurance', 'health'] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: 'Dimagrire',
  tone: 'Tonificare',
  strength: 'Forza',
  endurance: 'Resistenza',
  health: 'Salute e benessere',
};

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
};
export const LEVEL_HINTS: Record<Level, string> = {
  beginner: 'Mi alleno da meno di 6 mesi o riprendo dopo una lunga pausa',
  intermediate: 'Mi alleno con regolarità da almeno 6 mesi',
  advanced: 'Mi alleno da anni e conosco bene la tecnica',
};

export const SEXES = ['female', 'male', 'other', 'undisclosed'] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABELS: Record<Sex, string> = {
  female: 'Donna',
  male: 'Uomo',
  other: 'Altro',
  undisclosed: 'Preferisco non dirlo',
};

/** Attrezzi a cui l'utente ha accesso. Il corpo libero è sempre disponibile. */
export const EQUIPMENT = ['dumbbells', 'barbell', 'bench', 'machines', 'cable', 'pullup_bar', 'kettlebell', 'bands'] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  dumbbells: 'Manubri',
  barbell: 'Bilanciere',
  bench: 'Panca',
  machines: 'Macchine',
  cable: 'Cavi',
  pullup_bar: 'Sbarra per trazioni',
  kettlebell: 'Kettlebell',
  bands: 'Elastici',
};

/** Zone del corpo con limitazioni o infortuni: il piano esclude gli esercizi che le caricano. */
export const LIMITATIONS = ['knee', 'shoulder', 'lower_back', 'wrist', 'hip', 'ankle', 'neck', 'elbow'] as const;
export type Limitation = (typeof LIMITATIONS)[number];
export const LIMITATION_LABELS: Record<Limitation, string> = {
  knee: 'Ginocchio',
  shoulder: 'Spalla',
  lower_back: 'Zona lombare',
  wrist: 'Polso',
  hip: 'Anca',
  ankle: 'Caviglia',
  neck: 'Collo',
  elbow: 'Gomito',
};

export const MUSCLES = ['legs', 'glutes', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio'] as const;
export type Muscle = (typeof MUSCLES)[number];
export const MUSCLE_LABELS: Record<Muscle, string> = {
  legs: 'Gambe',
  glutes: 'Glutei',
  chest: 'Petto',
  back: 'Schiena',
  shoulders: 'Spalle',
  arms: 'Braccia',
  core: 'Addome',
  cardio: 'Cardio',
};

/* ---------- Idratazione ---------- */

export const CONTAINERS = ['glass', 'bottle_05', 'bottle_1', 'bottle_15', 'flask_05'] as const;
export type Container = (typeof CONTAINERS)[number];
export const CONTAINER_ML: Record<Container, number> = { glass: 200, bottle_05: 500, bottle_1: 1000, bottle_15: 1500, flask_05: 500 };
export const CONTAINER_LABELS: Record<Container, string> = {
  glass: 'Bicchiere',
  bottle_05: 'Bottiglia 0,5 L',
  bottle_1: 'Bottiglia 1 L',
  bottle_15: 'Bottiglia 1,5 L',
  flask_05: 'Borraccia 0,5 L',
};
/** Obiettivo della versione gratuita e di chi non ha ancora indicato il peso. */
export const DEFAULT_HYDRATION_GOAL_ML = 2000;
/** Giorni di storico dei progressi nella versione gratuita. */
export const FREE_HISTORY_DAYS = 7;
