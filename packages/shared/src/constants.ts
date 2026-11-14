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
