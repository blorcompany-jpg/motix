import { Link } from 'react-router-dom';
import { PRICE_YEARLY_EUR, TRIAL_DAYS, euro } from '@motix/shared';
import { AuthLayout } from '../ui';

const INCLUDED = [
  'Piano personalizzato, dal tuo professionista o dall’AI',
  'Piano alimentare del nutrizionista e diario',
  'Check-in, chat e storico completo dei carichi',
  'Sensore motix pod e app salute',
  'Idratazione calcolata su peso e attività',
];

/**
 * Acquisto dal sito, allo stesso prezzo dell'app, senza passare dagli store.
 * TODO prima del lancio: collegare il pagamento online (es. Stripe) e la conferma automatica che attiva l'abbonamento.
 */
export function Subscribe() {
  return (
    <AuthLayout title={<>MOTIX Premium</>} lead={`${euro(PRICE_YEARLY_EUR)} all’anno, IVA inclusa. Palestre e professionisti usano MOTIX gratis: paga solo chi si allena.`}>
      <div className="stack">
        <h2>{euro(PRICE_YEARLY_EUR)} all’anno</h2>
        <p>Pagamento unico, IVA inclusa. Prima puoi provare tutto gratis per {TRIAL_DAYS} giorni dall’app.</p>
        <ul className="stack tight" style={{ paddingLeft: 18 }}>
          {INCLUDED.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <div className="alert info">
          Il pagamento dal sito si attiva al lancio dell’app. Lo stesso abbonamento si potrà comprare anche da App Store e Google Play, allo stesso prezzo.
        </div>
        <p style={{ fontSize: 14 }}>Sei un professionista o una palestra? <Link to="/pt/registrazione">Registrati gratis</Link> · <Link to="/affiliazione">Affilia la palestra</Link></p>
      </div>
    </AuthLayout>
  );
}
