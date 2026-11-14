export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Tipo di messaggio, utile per i test e per i modelli grafici futuri. */
  kind:
    | 'parental_consent'
    | 'verify_email'
    | 'reset_password'
    | 'staff_invite'
    | 'trainer_structure_invite'
    | 'client_invite'
    | 'structure_approved'
    | 'structure_rejected'
    | 'trainer_approved'
    | 'trainer_rejected';
  link?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * In sviluppo e nei test le email non partono: vengono tenute in memoria e scritte nel log.
 * In produzione va sostituito con un servizio di invio (SMTP o API) con server in UE.
 */
export class DevMailer implements Mailer {
  outbox: Mail[] = [];
  constructor(private log?: (msg: string) => void) {}
  async send(mail: Mail) {
    this.outbox.push(mail);
    this.log?.(`[email:${mail.kind}] a ${mail.to} – ${mail.subject}${mail.link ? `\n  ${mail.link}` : ''}`);
  }
  last(kind: Mail['kind'], to?: string) {
    return [...this.outbox].reverse().find((m) => m.kind === kind && (!to || m.to === to));
  }
}
