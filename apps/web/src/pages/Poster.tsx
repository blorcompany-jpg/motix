import { TRIAL_DAYS } from '@motix/shared';
import { useAuth } from '../auth';
import { ErrorBox, Logo } from '../ui';
import { useLoad } from './dashboard/common';

/** Locandina del kit di lancio: sfida di 14 giorni con QR e codice della struttura, pronta da stampare. */
export function Poster() {
  const { user } = useAuth();
  const qr = useLoad<{ code: string; link: string; svg: string }>('/structure/qr');
  const name = user?.ownedStructure?.displayName ?? user?.instructorOf?.displayName ?? '';
  return (
    <div className="poster-page">
      <div className="row no-print">
        <button className="btn" onClick={() => window.print()}>Stampa la locandina</button>
        <span style={{ color: '#3a4a63', fontSize: 14 }}>Formato A4 verticale, con la grafica di sfondo attiva.</span>
      </div>
      <ErrorBox error={qr.error} />
      {qr.data && (
        <div className="poster">
          <Logo size={52} suffix="club" />
          <span className="eyebrow" style={{ fontSize: 15 }}>{name}</span>
          <h1>Sfida<br />{TRIAL_DAYS} giorni</h1>
          <p style={{ fontSize: 20, color: '#eef3fa' }}>Allenati con MOTIX per due settimane: piano su misura, progressi misurati, l’acqua giusta ogni giorno. La prova è gratuita.</p>
          <div className="row" style={{ gap: 28, alignItems: 'center' }}>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr.data.svg }} />
            <div className="stack tight">
              <span style={{ color: '#a9b7cc', fontSize: 16 }}>Inquadra il QR oppure scarica l’app e inserisci il codice</span>
              <span className="code" style={{ fontSize: 44 }}>{qr.data.code}</span>
            </div>
          </div>
          <span style={{ color: '#6f7f98', fontSize: 13 }}>Move. Measure. Rise. · Un’app di BTECH S.r.l.</span>
        </div>
      )}
    </div>
  );
}
