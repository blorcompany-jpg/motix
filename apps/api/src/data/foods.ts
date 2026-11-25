/**
 * Libreria iniziale di alimenti, con i valori per 100 g di parte edibile.
 *
 * Valori indicativi ricavati da tabelle di composizione pubbliche: prima del lancio vanno rivisti
 * da un nutrizionista (come la libreria degli esercizi). I nutrizionisti possono aggiungere alimenti propri.
 */
import type { FoodCategory } from '@motix/shared';

type Row = [slug: string, name: string, category: FoodCategory, kcal: number, protein: number, carbs: number, fat: number, fiber: number];

const ROWS: Row[] = [
  // Cereali e derivati (a crudo se non indicato)
  ['pasta-semola', 'Pasta di semola', 'cereals', 353, 13.0, 70.9, 1.5, 3.0],
  ['pasta-integrale', 'Pasta integrale', 'cereals', 324, 13.4, 62.5, 2.5, 8.0],
  ['riso-bianco', 'Riso bianco', 'cereals', 332, 6.7, 80.4, 0.4, 1.0],
  ['riso-integrale', 'Riso integrale', 'cereals', 337, 7.5, 77.4, 1.9, 1.9],
  ['farro', 'Farro', 'cereals', 335, 15.1, 67.1, 2.5, 6.8],
  ['cous-cous', 'Cous cous', 'cereals', 370, 12.8, 75.0, 0.7, 5.0],
  ['pane-comune', 'Pane comune', 'cereals', 280, 8.5, 58.0, 1.0, 3.0],
  ['pane-integrale', 'Pane integrale', 'cereals', 245, 9.0, 47.0, 1.5, 6.5],
  ['fiocchi-avena', 'Fiocchi d’avena', 'cereals', 372, 13.5, 61.0, 7.0, 10.0],
  ['fette-biscottate', 'Fette biscottate', 'cereals', 410, 11.3, 82.3, 6.0, 3.5],
  ['gallette-riso', 'Gallette di riso', 'cereals', 387, 8.0, 81.0, 2.8, 4.2],
  ['patate', 'Patate', 'cereals', 80, 2.0, 17.5, 0.1, 2.0],
  // Carne, pesce e uova
  ['petto-pollo', 'Petto di pollo', 'protein', 100, 23.3, 0, 0.8, 0],
  ['petto-tacchino', 'Petto di tacchino', 'protein', 107, 24.0, 0, 1.2, 0],
  ['manzo-magro', 'Manzo magro', 'protein', 110, 21.5, 0, 2.5, 0],
  ['uova', 'Uova intere', 'protein', 130, 12.5, 0.5, 8.7, 0],
  ['albume', 'Albume d’uovo', 'protein', 45, 10.5, 0.7, 0.2, 0],
  ['salmone', 'Salmone fresco', 'protein', 180, 19.0, 0, 12.0, 0],
  ['merluzzo', 'Merluzzo', 'protein', 72, 17.0, 0, 0.3, 0],
  ['tonno-naturale', 'Tonno al naturale, sgocciolato', 'protein', 105, 24.0, 0, 1.0, 0],
  ['bresaola', 'Bresaola', 'protein', 150, 32.0, 0.5, 2.6, 0],
  ['prosciutto-crudo-sgrassato', 'Prosciutto crudo sgrassato', 'protein', 145, 28.0, 0.3, 3.5, 0],
  ['tofu', 'Tofu', 'protein', 120, 13.0, 1.5, 7.0, 0.5],
  // Latte e derivati
  ['latte-ps', 'Latte parzialmente scremato', 'dairy', 46, 3.5, 5.0, 1.6, 0],
  ['yogurt-greco-0', 'Yogurt greco 0%', 'dairy', 57, 10.0, 4.0, 0.2, 0],
  ['yogurt-bianco', 'Yogurt bianco intero', 'dairy', 66, 3.8, 4.3, 3.9, 0],
  ['ricotta', 'Ricotta vaccina', 'dairy', 146, 8.8, 3.5, 10.9, 0],
  ['fiocchi-latte', 'Fiocchi di latte', 'dairy', 95, 11.5, 3.0, 4.3, 0],
  ['mozzarella', 'Mozzarella vaccina', 'dairy', 250, 18.7, 0.7, 19.5, 0],
  ['parmigiano', 'Parmigiano Reggiano', 'dairy', 392, 33.0, 0, 28.0, 0],
  // Verdure
  ['zucchine', 'Zucchine', 'vegetables', 14, 1.3, 1.4, 0.1, 1.2],
  ['pomodori', 'Pomodori', 'vegetables', 17, 1.0, 3.5, 0.2, 1.0],
  ['lattuga', 'Insalata (lattuga)', 'vegetables', 15, 1.4, 2.2, 0.3, 1.5],
  ['spinaci', 'Spinaci', 'vegetables', 23, 2.9, 1.4, 0.4, 2.2],
  ['broccoli', 'Broccoli', 'vegetables', 34, 2.8, 4.0, 0.4, 2.6],
  ['carote', 'Carote', 'vegetables', 35, 1.0, 7.6, 0.2, 3.0],
  ['peperoni', 'Peperoni', 'vegetables', 26, 0.9, 4.2, 0.3, 1.9],
  ['melanzane', 'Melanzane', 'vegetables', 18, 1.1, 2.6, 0.4, 2.6],
  // Frutta
  ['mela', 'Mela', 'fruit', 53, 0.3, 13.0, 0.1, 2.0],
  ['banana', 'Banana', 'fruit', 89, 1.1, 22.8, 0.3, 2.6],
  ['arancia', 'Arancia', 'fruit', 47, 0.9, 11.8, 0.1, 2.4],
  ['kiwi', 'Kiwi', 'fruit', 61, 1.1, 14.7, 0.5, 3.0],
  ['fragole', 'Fragole', 'fruit', 32, 0.7, 7.7, 0.3, 2.0],
  ['frutti-bosco', 'Frutti di bosco', 'fruit', 50, 0.8, 11.0, 0.3, 4.0],
  // Legumi (lessati)
  ['ceci', 'Ceci lessati', 'legumes', 164, 8.9, 27.4, 2.6, 7.6],
  ['lenticchie', 'Lenticchie lessate', 'legumes', 116, 9.0, 20.1, 0.4, 7.9],
  ['fagioli', 'Fagioli lessati', 'legumes', 127, 8.7, 22.8, 0.5, 6.4],
  ['piselli', 'Piselli', 'legumes', 81, 5.4, 14.5, 0.4, 5.1],
  // Grassi e frutta secca
  ['olio-evo', 'Olio extravergine d’oliva', 'fats', 899, 0, 0, 99.9, 0],
  ['mandorle', 'Mandorle', 'fats', 579, 21.2, 21.6, 49.9, 12.5],
  ['noci', 'Noci', 'fats', 654, 15.2, 13.7, 65.2, 6.7],
  ['burro-arachidi', 'Burro di arachidi', 'fats', 588, 25.0, 20.0, 50.0, 6.0],
  ['avocado', 'Avocado', 'fats', 160, 2.0, 8.5, 14.7, 6.7],
  // Altro
  ['miele', 'Miele', 'other', 304, 0.3, 82.4, 0, 0.2],
  ['marmellata', 'Marmellata', 'other', 250, 0.4, 62.0, 0.1, 1.0],
  ['cioccolato-fondente', 'Cioccolato fondente 70%', 'other', 598, 7.8, 45.9, 42.6, 10.9],
  ['proteine-whey', 'Proteine del siero in polvere', 'other', 380, 78.0, 6.0, 6.0, 0],
];

export const FOODS = ROWS.map(([slug, name, category, kcal, protein, carbs, fat, fiber]) => ({ slug, name, category, kcal, protein, carbs, fat, fiber }));
