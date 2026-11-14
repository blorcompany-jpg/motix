import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, createEnv, tokenFromLink, userInput, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => { env = await createEnv(); });
afterAll(async () => { await env.close(); });

describe('registrazione di chi si allena', () => {
  it('crea l’account, i consensi e la prova di 14 giorni', async () => {
    const res = await env.api('POST', '/auth/register', userInput());
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.consents).toMatchObject({ terms: true, health_data: true, share_trainer: false });
    expect(res.body.user.subscription).toMatchObject({ status: 'trial', trialDaysLeft: 14 });
    expect(res.body.user.subscription.firstChargeAt).toBe('2026-11-28T10:00:00.000Z');
    expect(res.body.user.referralCode).toMatch(/^AM[A-Z2-9]{6}$/);
    expect(env.mailer.last('verify_email', 'giulia@example.com')).toBeTruthy();

    const me = await env.api('GET', '/me', undefined, res.body.accessToken);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('giulia@example.com');
  });

  it('rifiuta un’email già registrata', async () => {
    const res = await env.api('POST', '/auth/register', userInput());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('richiede i consensi obbligatori', async () => {
    const res = await env.api('POST', '/auth/register', userInput({ email: 'a@example.com', consents: { terms: true, health_data: false } }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('consent_required');
  });

  it('rifiuta chi ha meno di 14 anni', async () => {
    const res = await env.api('POST', '/auth/register', userInput({ email: 'b@example.com', birthDate: '2013-06-01' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('age_too_young');
  });

  it('indica i campi sbagliati', async () => {
    const res = await env.api('POST', '/auth/register', userInput({ email: 'non-una-email', password: 'corta' }));
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rifiuta codici di struttura, personal trainer e amico inesistenti', async () => {
    for (const [field, code] of [['structureCode', 'structure_code_invalid'], ['trainerCode', 'trainer_code_invalid'], ['referralCode', 'referral_code_invalid']] as const) {
      const res = await env.api('POST', '/auth/register', userInput({ email: 'c@example.com', [field]: 'ZZZZZZ' }));
      expect(res.body.error.code).toBe(code);
    }
  });

  it('registra l’amico che ha invitato', async () => {
    const giulia = await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: PASSWORD });
    const res = await env.api('POST', '/auth/register', userInput({ email: 'amica@example.com', referralCode: giulia.body.user.referralCode }));
    expect(res.status).toBe(201);
  });
});

describe('minorenni: 14–17 anni con consenso di un genitore', () => {
  const minor = (over = {}) => userInput({ email: 'sara@example.com', firstName: 'Sara', birthDate: '2010-09-01', parent: { name: 'Anna Neri', email: 'anna@example.com' }, ...over });

  it('senza genitore non si registra', async () => {
    const res = await env.api('POST', '/auth/register', minor({ parent: undefined }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('parent_required');
  });

  it('l’email del genitore deve essere diversa', async () => {
    const res = await env.api('POST', '/auth/register', minor({ parent: { name: 'Anna Neri', email: 'sara@example.com' } }));
    expect(res.body.error.code).toBe('parent_email_same');
  });

  it('l’account resta bloccato finché il genitore non conferma', async () => {
    const res = await env.api('POST', '/auth/register', minor());
    expect(res.status).toBe(201);
    expect(res.body.pendingParentalConsent).toBe(true);
    expect(res.body.accessToken).toBeUndefined();

    const login = await env.api('POST', '/auth/login', { email: 'sara@example.com', password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('parental_consent_pending');

    const mail = env.mailer.last('parental_consent', 'anna@example.com');
    const token = tokenFromLink(mail?.link);
    const info = await env.api('GET', `/auth/parental-consent/${token}`);
    expect(info.body).toMatchObject({ childFirstName: 'Sara', parentName: 'Anna Neri' });

    const confirm = await env.api('POST', `/auth/parental-consent/${token}`, { decision: 'confirm' });
    expect(confirm.body.status).toBe('confirmed');

    const after = await env.api('POST', '/auth/login', { email: 'sara@example.com', password: PASSWORD });
    expect(after.status).toBe(200);
    expect(after.body.user.subscription.status).toBe('trial');

    const again = await env.api('POST', `/auth/parental-consent/${token}`, { decision: 'confirm' });
    expect(again.status).toBe(409);
  });

  it('se il genitore nega il consenso i dati vengono cancellati', async () => {
    await env.api('POST', '/auth/register', minor({ email: 'leo@example.com', firstName: 'Leo', parent: { name: 'Paolo Blu', email: 'paolo@example.com' } }));
    const token = tokenFromLink(env.mailer.last('parental_consent', 'paolo@example.com')?.link);
    const res = await env.api('POST', `/auth/parental-consent/${token}`, { decision: 'reject' });
    expect(res.body.status).toBe('rejected');
    const login = await env.api('POST', '/auth/login', { email: 'leo@example.com', password: PASSWORD });
    expect(login.status).toBe(401);
  });

  it('il link scade', async () => {
    await env.api('POST', '/auth/register', minor({ email: 'mia@example.com', parent: { name: 'Rita Rosa', email: 'rita@example.com' } }));
    const token = tokenFromLink(env.mailer.last('parental_consent', 'rita@example.com')?.link);
    const before = env.clock.now;
    env.clock.now = new Date(before.getTime() + 15 * 86_400_000);
    const res = await env.api('POST', `/auth/parental-consent/${token}`, { decision: 'confirm' });
    expect(res.status).toBe(410);
    // un nuovo invio genera un link valido
    const resend = await env.api('POST', '/auth/parental-consent/resend', { email: 'mia@example.com', password: PASSWORD });
    expect(resend.status).toBe(200);
    const fresh = tokenFromLink(env.mailer.last('parental_consent', 'rita@example.com')?.link);
    expect((await env.api('POST', `/auth/parental-consent/${fresh}`, { decision: 'confirm' })).status).toBe(200);
    env.clock.now = before;
  });
});

describe('chiamate dal browser', () => {
  it('consente PUT, PATCH e DELETE dalle origini autorizzate', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await env.app.inject({
        method: 'OPTIONS',
        url: '/me/profile',
        headers: { origin: 'http://localhost:8081', 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type' },
      });
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
      expect(String(res.headers['access-control-allow-methods'])).toContain(method);
    }
    const blocked = await env.app.inject({ method: 'OPTIONS', url: '/me', headers: { origin: 'https://sito-sconosciuto.example', 'access-control-request-method': 'GET' } });
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('accesso e sessioni', () => {
  it('rifiuta credenziali sbagliate senza distinguere il motivo', async () => {
    const wrong = await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: 'sbagliata-123' });
    const missing = await env.api('POST', '/auth/login', { email: 'nessuno@example.com', password: 'sbagliata-123' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it('rinnova la sessione e invalida il token già usato', async () => {
    const login = await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: PASSWORD });
    const first = await env.api('POST', '/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(login.body.refreshToken);
    // riuso del vecchio token: possibile furto, si chiudono tutte le sessioni
    const reuse = await env.api('POST', '/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
    const after = await env.api('POST', '/auth/refresh', { refreshToken: first.body.refreshToken });
    expect(after.status).toBe(401);
  });

  it('il logout chiude la sessione', async () => {
    const login = await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: PASSWORD });
    await env.api('POST', '/auth/logout', { refreshToken: login.body.refreshToken });
    expect((await env.api('POST', '/auth/refresh', { refreshToken: login.body.refreshToken })).status).toBe(401);
  });

  it('protegge le aree riservate', async () => {
    expect((await env.api('GET', '/me')).status).toBe(401);
    expect((await env.api('GET', '/me', undefined, 'token-falso')).status).toBe(401);
    const login = await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: PASSWORD });
    expect((await env.api('GET', '/admin/overview', undefined, login.body.accessToken)).status).toBe(403);
    expect((await env.api('GET', '/structure', undefined, login.body.accessToken)).status).toBe(403);
    expect((await env.api('GET', '/trainer', undefined, login.body.accessToken)).status).toBe(403);
    expect((await env.api('GET', '/admin/overview', undefined, env.adminToken)).status).toBe(200);
  });

  it('verifica l’email e reimposta la password', async () => {
    const verify = tokenFromLink(env.mailer.last('verify_email', 'giulia@example.com')?.link);
    expect((await env.api('POST', '/auth/email/verify', { token: verify })).status).toBe(200);
    expect((await env.api('POST', '/auth/email/verify', { token: verify })).status).toBe(422);

    expect((await env.api('POST', '/auth/password/forgot', { email: 'nessuno@example.com' })).status).toBe(200);
    await env.api('POST', '/auth/password/forgot', { email: 'giulia@example.com' });
    const token = tokenFromLink(env.mailer.last('reset_password', 'giulia@example.com')?.link);
    expect((await env.api('POST', '/auth/password/reset', { token, password: 'Nuova-password-9' })).status).toBe(200);
    expect((await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: PASSWORD })).status).toBe(401);
    expect((await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: 'Nuova-password-9' })).status).toBe(200);
  });

  it('un account sospeso non entra più', async () => {
    const reg = await env.api('POST', '/auth/register', userInput({ email: 'sospeso@example.com' }));
    await env.api('POST', `/admin/users/${reg.body.user.id}/suspend`, {}, env.adminToken);
    expect((await env.api('GET', '/me', undefined, reg.body.accessToken)).status).toBe(401);
    expect((await env.api('POST', '/auth/login', { email: 'sospeso@example.com', password: PASSWORD })).body.error.code).toBe('account_suspended');
  });

  it('cancella l’account su richiesta', async () => {
    const reg = await env.api('POST', '/auth/register', userInput({ email: 'addio@example.com' }));
    expect((await env.api('DELETE', '/me', undefined, reg.body.accessToken)).status).toBe(200);
    expect((await env.api('POST', '/auth/login', { email: 'addio@example.com', password: PASSWORD })).status).toBe(401);
  });
});
