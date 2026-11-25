/** Regole di business (sezione 3 del documento di progetto). */
export const TRIAL_DAYS = 14;
/** Durata dell'abbonamento: un anno, pagato in un'unica soluzione. */
export const COMMITMENT_MONTHS = 12;
/** Prezzo annuale per l'utente finale, IVA inclusa. Palestre e professionisti non pagano nulla. */
export const PRICE_YEARLY_EUR = 49.99;
/** Aliquota IVA italiana, per ricavare l'imponibile nei report. */
export const VAT_RATE = 0.22;
export const priceNetOfVat = (gross: number) => Math.round((gross / (1 + VAT_RATE)) * 100) / 100;
export const euro = (n: number) => `€${n.toFixed(2).replace('.', ',')}`;

/** Dove l'utente compra l'abbonamento: dentro l'app (App Store, Google Play), dal sito, o con un pacchetto della palestra. */
export const PURCHASE_CHANNELS = ['app_store', 'google_play', 'web', 'structure'] as const;
export type PurchaseChannel = (typeof PURCHASE_CHANNELS)[number];
export const PURCHASE_CHANNEL_LABELS: Record<PurchaseChannel, string> = {
  app_store: 'App Store',
  google_play: 'Google Play',
  web: 'Sito MOTIX',
  structure: 'Pacchetto della palestra',
};
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

/* ---------- Community e shop ---------- */

export const SHOP_CATEGORIES = ['sensor', 'equipment', 'apparel', 'accessories'] as const;
export const SHOP_CATEGORY_LABELS: Record<(typeof SHOP_CATEGORIES)[number], string> = {
  sensor: 'Sensore motix pod',
  equipment: 'Attrezzatura',
  apparel: 'Abbigliamento',
  accessories: 'Accessori',
};

export const REPORT_REASONS = ['Contenuto offensivo', 'Spam o pubblicità', 'Nudità o contenuto sessuale', 'Molestie o bullismo', 'Altro'] as const;

export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 80;
/**
 * Punti ai professionisti: per ogni abbonato che portano ricevono in punti il 20% di quanto ha pagato,
 * alla sottoscrizione e a ogni rinnovo. 1 punto vale €0,10 in premi fisici e buoni regalo.
 * Con il prezzo pieno di €49,99 sono 100 punti, cioè €10 in premi. Entrambi i valori si cambiano dal pannello BTECH.
 */
export const DEFAULT_POINT_RULES = { sharePct: 20, pointValueEur: 0.1 } as const;
export const pointsFor = (priceEur: number, rules: { sharePct: number; pointValueEur: number } = DEFAULT_POINT_RULES) =>
  rules.pointValueEur > 0 ? Math.round((priceEur * rules.sharePct) / 100 / rules.pointValueEur) : 0;

/* ---------- Professionisti ---------- */

/** Chi si registra come professionista sceglie la sua professione. Per il nutrizionista serve l'iscrizione all'albo. */
export const PROFESSIONS = ['personal_trainer', 'athletic_trainer', 'physiotherapist', 'nutritionist'] as const;
export type Profession = (typeof PROFESSIONS)[number];
export const PROFESSION_LABELS: Record<Profession, string> = {
  personal_trainer: 'Personal trainer',
  athletic_trainer: 'Preparatore atletico',
  physiotherapist: 'Fisioterapista / osteopata',
  nutritionist: 'Nutrizionista / dietista',
};
/** Professioni che devono indicare l'albo o l'ordine di iscrizione, verificato da BTECH. */
export const REGISTERED_PROFESSIONS: Profession[] = ['physiotherapist', 'nutritionist'];
/**
 * In Italia il piano alimentare personalizzato è riservato a biologi nutrizionisti, dietisti e medici:
 * in MOTIX lo crea solo il nutrizionista con l'iscrizione all'albo verificata.
 */
export const NUTRITION_PROFESSIONS: Profession[] = ['nutritionist'];
/** Un utente può avere al massimo un professionista per area: allenamento e alimentazione. */
export const professionArea = (p: Profession) => (p === 'nutritionist' ? 'nutrition' : 'training');

/* ---------- Pacchetti per le palestre ---------- */

/** Abbonamenti annuali comprati in blocco da una palestra per regalarli ai suoi iscritti. Facoltativo. */
export const DEFAULT_PACKAGE_RULES = { minSeats: 10, unitPriceEur: 39.99 } as const;
export const PACKAGE_STATUSES = ['requested', 'paid', 'cancelled'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/* ---------- Check-in periodici ---------- */

export const CHECK_IN_SCALE_LABELS = { energy: 'Energia', sleep: 'Sonno', stress: 'Stress', training: 'Allenamenti seguiti', nutrition: 'Alimentazione seguita' } as const;
export type CheckInScale = keyof typeof CHECK_IN_SCALE_LABELS;
export const DEFAULT_CHECK_IN_DAYS = 7;

/* ---------- Automazioni dei professionisti ---------- */

export const AUTOMATION_KINDS = ['welcome', 'check_in_reminder', 'inactive', 'at_risk'] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];
export const AUTOMATION_LABELS: Record<AutomationKind, string> = {
  welcome: 'Benvenuto al nuovo cliente',
  check_in_reminder: 'Promemoria del check-in',
  inactive: 'Nessuna seduta da 7 giorni',
  at_risk: 'Rischio abbandono alto',
};
export const AUTOMATION_DEFAULT_TEXT: Record<AutomationKind, string> = {
  welcome: 'Ciao {nome}, benvenuto! Da oggi ti seguo su MOTIX: trovi qui il tuo piano e puoi scrivermi quando vuoi.',
  check_in_reminder: 'Ciao {nome}, è il momento del check-in: bastano due minuti dalla sezione Check-in dell’app.',
  inactive: 'Ciao {nome}, è da una settimana che non ti vedo allenarti. Tutto bene? Se serve adattiamo il piano.',
  at_risk: 'Ciao {nome}, ho notato che ultimamente è più difficile allenarsi. Sentiamoci e troviamo insieme la soluzione.',
};

/* ---------- Alimentazione ---------- */

export const MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Colazione',
  snack_am: 'Spuntino mattina',
  lunch: 'Pranzo',
  snack_pm: 'Merenda',
  dinner: 'Cena',
};
export const FOOD_CATEGORIES = ['cereals', 'protein', 'dairy', 'vegetables', 'fruit', 'legumes', 'fats', 'other'] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  cereals: 'Cereali e derivati',
  protein: 'Carne, pesce e uova',
  dairy: 'Latte e derivati',
  vegetables: 'Verdure',
  fruit: 'Frutta',
  legumes: 'Legumi',
  fats: 'Grassi e frutta secca',
  other: 'Altro',
};

/* ---------- App salute ---------- */

export const HEALTH_SOURCES = ['apple_health', 'health_connect', 'manual'] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];
export const HEALTH_SOURCE_LABELS: Record<HealthSource, string> = {
  apple_health: 'Apple Salute',
  health_connect: 'Health Connect',
  manual: 'Inserito a mano',
};

/* ---------- Sensore motix pod ---------- */
/** Numero di serie del sensore: «MP-» seguito da 6-12 lettere o cifre. */
export const SENSOR_SERIAL = /^MP-[A-Z0-9]{6,12}$/;
export const SENSOR_STATUSES = ['in_stock', 'active', 'faulty', 'retired'] as const;
export type SensorStatus = (typeof SENSOR_STATUSES)[number];
export const SENSOR_STATUS_LABELS: Record<SensorStatus, string> = {
  in_stock: 'In magazzino',
  active: 'In uso',
  faulty: 'Guasto',
  retired: 'Ritirato',
};
/** Durata massima di una serie registrata dal sensore. */
export const SENSOR_MAX_SECONDS = 300;
export const SENSOR_MAX_SAMPLES = 30_000;
