/**
 * Libreria iniziale di esercizi.
 *
 * È una base di partenza creata con l'AI (sezione 8.7 del documento): prima del lancio ogni scheda
 * va rivista e approvata dal team BTECH dal pannello di amministrazione, e completata con i video.
 */
import type { Equipment, Level, Limitation, Muscle } from '@motix/shared';

export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v'
  | 'core'
  | 'glutes'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'cardio';

export type ExerciseUnit = 'reps' | 'seconds' | 'minutes';

const UNITS: Record<string, ExerciseUnit> = {
  'wall-sit': 'seconds',
  plank: 'seconds',
  corda: 'seconds',
  'camminata-veloce': 'minutes',
};

export interface SeedExercise {
  slug: string;
  name: string;
  pattern: Pattern;
  muscles: Muscle[];
  /** Attrezzi necessari (tutti). Vuoto = corpo libero. */
  equipment: Equipment[];
  level: Level;
  /** Zone che l'esercizio carica: se l'utente le ha indicate come limitazione, l'esercizio è escluso. */
  contraindications: Limitation[];
  loadable: boolean;
  description: string;
  /** Come si conta l'esercizio: ripetizioni, secondi di tenuta o minuti. */
  unit: ExerciseUnit;
}

const e = (
  slug: string,
  name: string,
  pattern: Pattern,
  muscles: Muscle[],
  equipment: Equipment[],
  level: Level,
  contraindications: Limitation[],
  loadable: boolean,
  description: string,
): SeedExercise => ({ slug, name, pattern, muscles, equipment, level, contraindications, loadable, description, unit: UNITS[slug] ?? 'reps' });

export const EXERCISES: SeedExercise[] = [
  // Squat
  e('squat-corpo-libero', 'Squat a corpo libero', 'squat', ['legs', 'glutes'], [], 'beginner', ['knee'], false, 'Piedi alla larghezza delle spalle, scendi portando indietro il bacino e risali spingendo sui talloni.'),
  e('goblet-squat', 'Goblet squat', 'squat', ['legs', 'glutes'], ['dumbbells'], 'beginner', ['knee'], true, 'Tieni un manubrio al petto, scendi con la schiena dritta fino a cosce parallele al pavimento.'),
  e('leg-press', 'Leg press', 'squat', ['legs', 'glutes'], ['machines'], 'beginner', ['knee'], true, 'Spingi la pedana senza bloccare le ginocchia in estensione; controlla la discesa.'),
  e('squat-bilanciere', 'Squat con bilanciere', 'squat', ['legs', 'glutes'], ['barbell'], 'intermediate', ['knee', 'lower_back'], true, 'Bilanciere sulle spalle, addome contratto, scendi controllando e risali mantenendo il petto alto.'),
  e('wall-sit', 'Sedia al muro', 'squat', ['legs'], [], 'beginner', ['knee'], false, 'Schiena al muro, ginocchia a 90 gradi, mantieni la posizione.'),
  // Hinge
  e('ponte-glutei', 'Ponte per i glutei', 'hinge', ['glutes', 'legs'], [], 'beginner', [], false, 'Supino, piedi a terra: solleva il bacino stringendo i glutei e scendi lentamente.'),
  e('stacco-rumeno-manubri', 'Stacco rumeno con manubri', 'hinge', ['legs', 'glutes', 'back'], ['dumbbells'], 'beginner', ['lower_back'], true, 'Ginocchia morbide, porta indietro il bacino con la schiena neutra e risali stringendo i glutei.'),
  e('stacco-bilanciere', 'Stacco da terra', 'hinge', ['legs', 'glutes', 'back'], ['barbell'], 'intermediate', ['lower_back'], true, 'Bilanciere vicino alle tibie, schiena neutra, spingi il pavimento e porta il bacino in avanti.'),
  e('swing-kettlebell', 'Swing con kettlebell', 'hinge', ['glutes', 'legs', 'core'], ['kettlebell'], 'intermediate', ['lower_back', 'shoulder'], true, 'Spinta esplosiva del bacino, braccia rilassate, il kettlebell arriva all’altezza del petto.'),
  e('leg-curl', 'Leg curl', 'hinge', ['legs'], ['machines'], 'beginner', [], true, 'Fletti le ginocchia portando il rullo verso i glutei, ritorna lentamente.'),
  // Affondi
  e('affondi-indietro', 'Affondi indietro', 'lunge', ['legs', 'glutes'], [], 'beginner', ['knee'], false, 'Passo indietro, scendi fino a sfiorare il pavimento con il ginocchio e torna in piedi.'),
  e('affondi-manubri', 'Affondi con manubri', 'lunge', ['legs', 'glutes'], ['dumbbells'], 'intermediate', ['knee'], true, 'Manubri lungo i fianchi, busto dritto, alterna le gambe.'),
  e('step-up', 'Step-up su panca', 'lunge', ['legs', 'glutes'], ['bench'], 'beginner', ['knee'], false, 'Sali sulla panca spingendo con la gamba avanti, scendi controllando.'),
  e('split-squat-bulgaro', 'Split squat bulgaro', 'lunge', ['legs', 'glutes'], ['dumbbells', 'bench'], 'advanced', ['knee', 'hip'], true, 'Piede dietro sulla panca, scendi in verticale mantenendo il ginocchio stabile.'),
  // Spinta orizzontale
  e('piegamenti-ginocchia', 'Piegamenti sulle ginocchia', 'push_h', ['chest', 'arms', 'shoulders'], [], 'beginner', ['wrist', 'shoulder'], false, 'Ginocchia a terra, corpo in linea, scendi con il petto verso il pavimento.'),
  e('piegamenti', 'Piegamenti sulle braccia', 'push_h', ['chest', 'arms', 'shoulders'], [], 'intermediate', ['wrist', 'shoulder'], false, 'Corpo in linea dalla testa ai talloni, gomiti a circa 45 gradi dal busto.'),
  e('panca-manubri', 'Distensioni su panca con manubri', 'push_h', ['chest', 'arms', 'shoulders'], ['dumbbells', 'bench'], 'beginner', ['shoulder'], true, 'Scapole addotte, scendi con i manubri ai lati del petto e spingi verso l’alto.'),
  e('panca-piana', 'Panca piana con bilanciere', 'push_h', ['chest', 'arms', 'shoulders'], ['barbell', 'bench'], 'intermediate', ['shoulder'], true, 'Bilanciere al petto in modo controllato, piedi saldi a terra, spingi senza inarcare troppo.'),
  e('chest-press', 'Chest press', 'push_h', ['chest', 'arms'], ['machines'], 'beginner', [], true, 'Regola il sedile all’altezza del petto, spingi in avanti senza bloccare i gomiti.'),
  // Spinta verticale
  e('lento-manubri', 'Lento avanti con manubri', 'push_v', ['shoulders', 'arms'], ['dumbbells'], 'beginner', ['shoulder', 'neck'], true, 'Manubri all’altezza delle spalle, spingi sopra la testa senza inarcare la schiena.'),
  e('military-press', 'Military press', 'push_v', ['shoulders', 'arms', 'core'], ['barbell'], 'intermediate', ['shoulder', 'lower_back', 'neck'], true, 'In piedi, addome e glutei contratti, porta il bilanciere sopra la testa.'),
  e('shoulder-press-macchina', 'Shoulder press alla macchina', 'push_v', ['shoulders', 'arms'], ['machines'], 'beginner', ['shoulder'], true, 'Schiena appoggiata, spingi verso l’alto e ritorna lentamente.'),
  e('alzate-laterali', 'Alzate laterali', 'push_v', ['shoulders'], ['dumbbells'], 'beginner', [], true, 'Gomiti leggermente flessi, solleva i manubri fino all’altezza delle spalle.'),
  e('alzate-laterali-elastico', 'Alzate laterali con elastico', 'push_v', ['shoulders'], ['bands'], 'beginner', [], false, 'Piedi sull’elastico, solleva le braccia ai lati fino all’altezza delle spalle.'),
  // Tirata orizzontale
  e('rematore-manubrio', 'Rematore con manubrio', 'pull_h', ['back', 'arms'], ['dumbbells', 'bench'], 'beginner', [], true, 'Mano e ginocchio sulla panca, porta il manubrio al fianco stringendo la scapola.'),
  e('rematore-bilanciere', 'Rematore con bilanciere', 'pull_h', ['back', 'arms'], ['barbell'], 'intermediate', ['lower_back'], true, 'Busto inclinato e schiena neutra, porta il bilanciere all’addome.'),
  e('pulley', 'Pulley basso', 'pull_h', ['back', 'arms'], ['cable'], 'beginner', [], true, 'Busto fermo, tira l’impugnatura all’addome portando indietro le spalle.'),
  e('rematore-elastico', 'Rematore con elastico', 'pull_h', ['back', 'arms'], ['bands'], 'beginner', [], false, 'Elastico fissato davanti a te, tira i gomiti indietro stringendo le scapole.'),
  e('superman', 'Superman', 'pull_h', ['back', 'glutes'], [], 'beginner', ['lower_back'], false, 'Prono, solleva insieme braccia e gambe di pochi centimetri e mantieni un secondo.'),
  // Tirata verticale
  e('lat-machine', 'Lat machine', 'pull_v', ['back', 'arms'], ['cable'], 'beginner', [], true, 'Tira la barra al petto con il busto leggermente inclinato indietro.'),
  e('trazioni', 'Trazioni alla sbarra', 'pull_v', ['back', 'arms'], ['pullup_bar'], 'advanced', ['shoulder', 'elbow'], false, 'Parti a braccia tese, porta il mento sopra la sbarra senza slanci.'),
  e('trazioni-elastico', 'Trazioni assistite con elastico', 'pull_v', ['back', 'arms'], ['pullup_bar', 'bands'], 'intermediate', ['shoulder'], false, 'Elastico sotto il piede o il ginocchio per alleggerire il peso del corpo.'),
  e('pulldown-elastico', 'Pulldown con elastico', 'pull_v', ['back', 'arms'], ['bands'], 'beginner', [], false, 'Elastico fissato in alto, tira i gomiti verso i fianchi.'),
  // Addome
  e('plank', 'Plank', 'core', ['core'], [], 'beginner', ['shoulder'], false, 'Gomiti sotto le spalle, corpo in linea.'),
  e('dead-bug', 'Dead bug', 'core', ['core'], [], 'beginner', [], false, 'Supino, estendi braccio e gamba opposti mantenendo la zona lombare a terra.'),
  e('crunch', 'Crunch', 'core', ['core'], [], 'beginner', ['neck'], false, 'Solleva le spalle dal pavimento guardando verso l’alto, senza tirare il collo.'),
  e('russian-twist', 'Russian twist', 'core', ['core'], [], 'intermediate', ['lower_back'], false, 'Seduto con il busto inclinato, ruota le spalle a destra e a sinistra.'),
  e('mountain-climber', 'Mountain climber', 'core', ['core', 'cardio'], [], 'intermediate', ['wrist', 'shoulder'], false, 'In posizione di plank alto, porta le ginocchia al petto alternandole a ritmo.'),
  e('bird-dog', 'Bird dog', 'core', ['core', 'back'], [], 'beginner', [], false, 'In quadrupedia, estendi braccio e gamba opposti mantenendo il bacino fermo.'),
  // Glutei
  e('hip-thrust', 'Hip thrust', 'glutes', ['glutes', 'legs'], ['barbell', 'bench'], 'intermediate', [], true, 'Scapole sulla panca, bilanciere sul bacino: spingi in alto e stringi i glutei.'),
  e('abduzioni-elastico', 'Abduzioni con elastico', 'glutes', ['glutes'], ['bands'], 'beginner', [], false, 'Elastico sopra le ginocchia, apri le gambe contro la resistenza.'),
  e('slanci-quadrupedia', 'Slanci in quadrupedia', 'glutes', ['glutes'], [], 'beginner', ['wrist'], false, 'In quadrupedia, spingi il tallone verso l’alto mantenendo il ginocchio flesso.'),
  // Braccia
  e('curl-manubri', 'Curl con manubri', 'biceps', ['arms'], ['dumbbells'], 'beginner', ['elbow'], true, 'Gomiti fermi ai fianchi, fletti gli avambracci e scendi lentamente.'),
  e('curl-elastico', 'Curl con elastico', 'biceps', ['arms'], ['bands'], 'beginner', ['elbow'], false, 'Piedi sull’elastico, fletti gli avambracci tenendo i gomiti fermi.'),
  e('pushdown-cavo', 'Pushdown ai cavi', 'triceps', ['arms'], ['cable'], 'beginner', ['elbow'], true, 'Gomiti ai fianchi, estendi gli avambracci verso il basso.'),
  e('dip-panca', 'Dip tra le panche', 'triceps', ['arms', 'chest'], ['bench'], 'intermediate', ['shoulder', 'wrist', 'elbow'], false, 'Mani sulla panca dietro di te, scendi flettendo i gomiti e risali.'),
  e('estensioni-manubrio', 'Estensioni sopra la testa', 'triceps', ['arms'], ['dumbbells'], 'beginner', ['elbow', 'shoulder'], true, 'Manubrio dietro la testa a due mani, estendi i gomiti verso l’alto.'),
  // Polpacci
  e('calf-raise', 'Sollevamenti sui polpacci', 'calves', ['legs'], [], 'beginner', ['ankle'], false, 'In piedi, sali sulle punte e scendi lentamente.'),
  // Cardio
  e('camminata-veloce', 'Camminata veloce', 'cardio', ['cardio'], [], 'beginner', [], false, 'Passo sostenuto, respiro accelerato ma riesci a parlare.'),
  e('jumping-jack', 'Jumping jack', 'cardio', ['cardio'], [], 'beginner', ['knee', 'ankle'], false, 'Salta aprendo gambe e braccia, ritorna alla posizione di partenza a ritmo costante.'),
  e('burpee', 'Burpee', 'cardio', ['cardio', 'legs', 'chest'], [], 'advanced', ['knee', 'wrist', 'shoulder', 'lower_back'], false, 'Dalla stazione eretta scendi in plank, piegamento, torna in piedi con un salto.'),
  e('corda', 'Salto con la corda (simulato)', 'cardio', ['cardio'], [], 'intermediate', ['knee', 'ankle'], false, 'Piccoli salti sulle punte come con la corda, a ritmo costante.'),
];
