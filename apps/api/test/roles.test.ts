import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyticsEvents } from '../src/db/schema';
import { PASSWORD, approvedStructure, approvedTrainer, createEnv, structureInput, tokenFromLink, trainerInput, userInput, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => { env = await createEnv(); });
afterAll(async () => { await env.close(); });

describe('affiliazione della struttura', () => {
  let ownerToken: string;
  let structureId: string;
  let code: string;

  it('la struttura nasce in attesa e senza codice', async () => {
    const reg = await env.api('POST', '/auth/register/structure', structureInput());
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('owner');
    expect(reg.body.user.ownedStructure).toMatchObject({ status: 'pending', code: null, displayName: 'Fit Bari' });
    ownerToken = reg.body.accessToken;
    expect((await env.api('GET', '/structure/qr', undefined, ownerToken)).body.error.code).toBe('structure_not_approved');
    expect((await env.api('GET', '/structure', undefined, ownerToken)).body.status).toBe('pending');
  });

  it('BTECH approva e assegna codice e QR', async () => {
    const list = await env.api('GET', '/admin/structures?status=pending', undefined, env.adminToken);
    expect(list.body.structures).toHaveLength(1);
    structureId = list.body.structures[0].id;
    const ok = await env.api('POST', `/admin/structures/${structureId}/approve`, {}, env.adminToken);
    expect(ok.body.status).toBe('approved');
    code = ok.body.code;
    expect(code).toMatch(/^MX[A-Z2-9]{6}$/);
    expect(env.mailer.last('structure_approved')?.text).toContain(code);

    const qr = await env.api('GET', '/structure/qr', undefined, ownerToken);
    expect(qr.body.link).toBe(`https://motix.test/j/${code}`);
    expect(qr.body.svg).toContain('<svg');

    const pub = await env.api('GET', `/public/structures/${code.toLowerCase()}`);
    expect(pub.body).toMatchObject({ displayName: 'Fit Bari', city: 'Bari' });
    expect((await env.api('POST', `/admin/structures/${structureId}/approve`, {}, env.adminToken)).status).toBe(409);
  });

  it('chi si iscrive con il codice è collegato alla struttura e conta come canale strutture', async () => {
    const reg = await env.api('POST', '/auth/register', userInput({ structureCode: code }));
    expect(reg.body.user.structure).toMatchObject({ displayName: 'Fit Bari' });
    const events = await env.handle.db.select().from(analyticsEvents).where(eq(analyticsEvents.type, 'registrazione_con_codice'));
    expect(events[0]).toMatchObject({ structureId, channel: 'structure' });
  });

  it('la struttura vede i dati personali solo con il consenso dell’iscritto', async () => {
    await env.api('POST', '/auth/register', userInput({ email: 'aperto@example.com', firstName: 'Piero', structureCode: code, consents: { terms: true, health_data: true, share_structure: true } }));
    const res = await env.api('GET', '/structure/members', undefined, ownerToken);
    expect(res.body.members).toHaveLength(2);
    const hidden = res.body.members.find((m: any) => !m.sharesData);
    const shown = res.body.members.find((m: any) => m.sharesData);
    expect(hidden).toMatchObject({ firstName: null, lastName: null, email: null, subscriptionStatus: 'trial' });
    expect(shown).toMatchObject({ firstName: 'Piero', email: 'aperto@example.com' });
    const overview = await env.api('GET', '/structure/overview', undefined, ownerToken);
    expect(overview.body).toMatchObject({ members: 2, inTrial: 2, subscribed: 0 });
  });

  it('l’utente può cambiare o lasciare la struttura: una sola alla volta', async () => {
    const other = await approvedStructure(env, { owner: { email: 'altro@palestra.example', password: PASSWORD, firstName: 'Ida', lastName: 'Gialli' }, structure: { legalName: 'ASD Lecce Sport', displayName: 'Lecce Sport', type: 'asd', city: 'Lecce', province: 'LE' } });
    const login = await env.api('POST', '/auth/login', { email: 'giulia@example.com', password: PASSWORD });
    const moved = await env.api('PUT', '/me/structure', { code: other.code }, login.body.accessToken);
    expect(moved.body.structure.displayName).toBe('Lecce Sport');
    const left = await env.api('DELETE', '/me/structure', undefined, login.body.accessToken);
    expect(left.body.structure).toBeNull();
    expect((await env.api('PUT', '/me/structure', { code: 'MXZZZZZZ' }, login.body.accessToken)).status).toBe(422);
  });

  it('il rifiuto avvisa il titolare con il motivo', async () => {
    await env.api('POST', '/auth/register/structure', structureInput({ owner: { email: 'no@palestra.example', password: PASSWORD, firstName: 'Ugo', lastName: 'Neri' } }));
    const list = await env.api('GET', '/admin/structures?status=pending', undefined, env.adminToken);
    const res = await env.api('POST', `/admin/structures/${list.body.structures[0].id}/reject`, { reason: 'Dati societari incompleti' }, env.adminToken);
    expect(res.body.status).toBe('rejected');
    expect(env.mailer.last('structure_rejected', 'no@palestra.example')?.text).toContain('Dati societari incompleti');
  });

  it('istruttore: invito, accesso e visibilità solo sugli iscritti assegnati', async () => {
    const invite = await env.api('POST', '/structure/staff/invite', { email: 'istruttore@example.com', role: 'instructor' }, ownerToken);
    expect(invite.status).toBe(201);
    expect(invite.body.invites).toHaveLength(1);
    const token = tokenFromLink(env.mailer.last('staff_invite', 'istruttore@example.com')?.link);
    expect((await env.api('GET', `/auth/staff-invite/${token}`)).body.structure.displayName).toBe('Fit Bari');
    const accept = await env.api('POST', '/auth/staff-invite/accept', { token, password: PASSWORD, firstName: 'Elena', lastName: 'Viola' });
    expect(accept.status).toBe(201);
    expect(accept.body.user).toMatchObject({ role: 'instructor', instructorOf: { displayName: 'Fit Bari' } });
    expect((await env.api('POST', '/auth/staff-invite/accept', { token, password: PASSWORD, firstName: 'E', lastName: 'V' })).status).toBe(404);

    const insToken = accept.body.accessToken;
    expect((await env.api('GET', '/structure/members', undefined, insToken)).body.members).toHaveLength(0);
    expect((await env.api('GET', '/structure/staff', undefined, insToken)).status).toBe(403);

    const staff = await env.api('GET', '/structure/staff', undefined, ownerToken);
    const members = await env.api('GET', '/structure/members', undefined, ownerToken);
    const assign = await env.api('PUT', `/structure/instructors/${staff.body.instructors[0].instructorId}/members`, { userIds: [members.body.members[0].id] }, ownerToken);
    expect(assign.body.assigned).toBe(1);
    expect((await env.api('GET', '/structure/members', undefined, insToken)).body.members).toHaveLength(1);

    await env.api('DELETE', `/structure/instructors/${staff.body.instructors[0].instructorId}`, undefined, ownerToken);
    expect((await env.api('GET', '/structure/members', undefined, insToken)).status).toBe(401);
  });

  it('il titolare di una struttura non può cancellarsi da solo', async () => {
    expect((await env.api('DELETE', '/me', undefined, ownerToken)).body.error.code).toBe('owner_has_structure');
  });
});

describe('personal trainer', () => {
  it('deve essere maggiorenne', async () => {
    const res = await env.api('POST', '/auth/register/trainer', trainerInput({ birthDate: '2010-01-01' }));
    expect(res.body.error.code).toBe('trainer_must_be_adult');
  });

  it('prima dell’approvazione non può invitare clienti', async () => {
    const reg = await env.api('POST', '/auth/register/trainer', trainerInput());
    expect(reg.status).toBe(201);
    expect(reg.body.user.trainer).toMatchObject({ status: 'pending', pointsBalance: 0 });
    expect(reg.body.user.trainer.inviteCode).toMatch(/^PT[A-Z2-9]{6}$/);
    expect(reg.body.user.subscription).toBeNull(); // il personal trainer non paga
    const invite = await env.api('POST', '/trainer/clients/invite', { email: 'x@example.com' }, reg.body.accessToken);
    expect(invite.body.error.code).toBe('trainer_not_approved');
    expect((await env.api('GET', `/public/trainers/${reg.body.user.trainer.inviteCode}`)).status).toBe(404);

    const ok = await env.api('POST', `/admin/trainers/${reg.body.user.trainer.id}/approve`, {}, env.adminToken);
    expect(ok.body.status).toBe('approved');
    expect((await env.api('GET', `/public/trainers/${reg.body.user.trainer.inviteCode}`)).body.firstName).toBe('Luca');
  });

  it('il cliente che si registra con il codice è collegato subito; i dati si vedono solo con il consenso', async () => {
    const pt = await env.api('POST', '/auth/login', { email: 'pt@example.com', password: PASSWORD });
    const code = pt.body.user.trainer.inviteCode;
    const client = await env.api('POST', '/auth/register', userInput({ email: 'cliente@example.com', firstName: 'Nora', lastName: 'Fabbri', trainerCode: code }));
    expect(client.status).toBe(201);

    let clients = await env.api('GET', '/trainer/clients', undefined, pt.body.accessToken);
    expect(clients.body.clients[0]).toMatchObject({ status: 'active', dataConsent: false, client: { firstName: 'Nora', lastName: 'F.', email: null }, subscriptionStatus: 'trial' });

    await env.api('PATCH', '/me/consents', { share_trainer: true }, client.body.accessToken);
    clients = await env.api('GET', '/trainer/clients', undefined, pt.body.accessToken);
    expect(clients.body.clients[0].client).toMatchObject({ lastName: 'Fabbri', email: 'cliente@example.com' });

    await env.api('PATCH', '/me/consents', { share_trainer: false }, client.body.accessToken);
    clients = await env.api('GET', '/trainer/clients', undefined, pt.body.accessToken);
    expect(clients.body.clients[0].client.email).toBeNull();

    expect((await env.api('PATCH', '/me/consents', { terms: false }, client.body.accessToken)).body.error.code).toBe('consent_required');
  });

  it('un solo personal trainer attivo per utente; la chiusura toglie l’accesso', async () => {
    const second = await approvedTrainer(env, { email: 'pt2@example.com', firstName: 'Dario' });
    const client = await env.api('POST', '/auth/login', { email: 'cliente@example.com', password: PASSWORD });
    const tok = client.body.accessToken;
    expect((await env.api('POST', '/me/trainer-links', { code: second.code }, tok)).body.error.code).toBe('trainer_already_linked');

    const links = await env.api('GET', '/me/trainer-links', undefined, tok);
    expect(links.body.links).toHaveLength(1);
    const closed = await env.api('POST', `/me/trainer-links/${links.body.links[0].id}/close`, {}, tok);
    expect(closed.body.links).toHaveLength(0);

    const linked = await env.api('POST', '/me/trainer-links', { code: second.code }, tok);
    expect(linked.status).toBe(201);
    expect(linked.body.links[0]).toMatchObject({ status: 'active', firstName: 'Dario' });
  });

  it('richiesta dell’utente: parte quando il personal trainer accetta', async () => {
    const pt = await env.api('POST', '/auth/login', { email: 'pt@example.com', password: PASSWORD });
    const user = await env.api('POST', '/auth/register', userInput({ email: 'richiesta@example.com' }));
    const req = await env.api('POST', '/me/trainer-links/request', { trainerId: pt.body.user.trainer.id }, user.body.accessToken);
    expect(req.body.links[0].status).toBe('requested_by_user');
    expect((await env.api('POST', '/me/trainer-links/request', { trainerId: pt.body.user.trainer.id }, user.body.accessToken)).status).toBe(409);
    const clients = await env.api('GET', '/trainer/clients', undefined, pt.body.accessToken);
    const pending = clients.body.clients.find((c: any) => c.status === 'requested_by_user');
    const accepted = await env.api('POST', `/trainer/clients/${pending.linkId}/accept`, {}, pt.body.accessToken);
    expect(accepted.body.clients.find((c: any) => c.linkId === pending.linkId).status).toBe('active');
  });

  it('invito del personal trainer: parte quando l’utente accetta', async () => {
    const pt = await env.api('POST', '/auth/login', { email: 'pt@example.com', password: PASSWORD });
    const user = await env.api('POST', '/auth/register', userInput({ email: 'invitato@example.com' }));
    expect((await env.api('POST', '/trainer/clients/invite', { email: 'invitato@example.com' }, pt.body.accessToken)).status).toBe(202);
    expect(env.mailer.last('client_invite', 'invitato@example.com')).toBeTruthy();
    const links = await env.api('GET', '/me/trainer-links', undefined, user.body.accessToken);
    expect(links.body.links[0].status).toBe('requested_by_trainer');
    const ok = await env.api('POST', `/me/trainer-links/${links.body.links[0].id}/accept`, {}, user.body.accessToken);
    expect(ok.body.links[0].status).toBe('active');
    // invito a chi non ha ancora l'app: parte solo l'email con il codice
    expect((await env.api('POST', '/trainer/clients/invite', { email: 'nuovo@example.com' }, pt.body.accessToken)).status).toBe(202);
    expect(env.mailer.last('client_invite', 'nuovo@example.com')?.text).toContain(pt.body.user.trainer.inviteCode);
  });

  it('lavora con più strutture: richiesta del PT o invito della struttura', async () => {
    const a = await approvedStructure(env, { owner: { email: 'a@gym.example', password: PASSWORD, firstName: 'A', lastName: 'A' } });
    const b = await approvedStructure(env, { owner: { email: 'b@gym.example', password: PASSWORD, firstName: 'B', lastName: 'B' } });
    const pt = await env.api('POST', '/auth/login', { email: 'pt@example.com', password: PASSWORD });
    const tok = pt.body.accessToken;
    const trainerId = pt.body.user.trainer.id;

    const req = await env.api('POST', '/trainer/structures', { code: a.code }, tok);
    expect(req.body.structures[0].status).toBe('requested_by_trainer');
    const acc = await env.api('POST', `/structure/trainers/${trainerId}/accept`, {}, a.ownerToken);
    expect(acc.body.trainers[0].status).toBe('active');

    const inv = await env.api('POST', '/structure/staff/invite', { email: 'pt@example.com', role: 'personal_trainer' }, b.ownerToken);
    expect(inv.body.trainers[0].status).toBe('invited_by_structure');
    const ok = await env.api('POST', `/trainer/structures/${b.id}/accept`, {}, tok);
    expect(ok.body.structures.filter((s: any) => s.status === 'active')).toHaveLength(2);

    const left = await env.api('POST', `/trainer/structures/${a.id}/leave`, {}, tok);
    expect(left.body.structures).toHaveLength(1);
  });

  it('un PT invitato per email da una struttura è collegato appena si registra con il suo codice', async () => {
    const s = await approvedStructure(env, { owner: { email: 'c@gym.example', password: PASSWORD, firstName: 'C', lastName: 'C' } });
    await env.api('POST', '/structure/staff/invite', { email: 'nuovopt@example.com', role: 'personal_trainer' }, s.ownerToken);
    expect(env.mailer.last('staff_invite', 'nuovopt@example.com')?.link).toContain(`struttura=${s.code}`);
    const reg = await env.api('POST', '/auth/register/trainer', trainerInput({ email: 'nuovopt@example.com', structureCode: s.code }));
    const mine = await env.api('GET', '/trainer/structures', undefined, reg.body.accessToken);
    expect(mine.body.structures[0].status).toBe('active');
  });
});

describe('pannello BTECH', () => {
  it('mostra i numeri e cerca gli utenti', async () => {
    const overview = await env.api('GET', '/admin/overview', undefined, env.adminToken);
    expect(overview.body.structures.approved).toBeGreaterThanOrEqual(4);
    expect(overview.body.subscriptions.trial).toBeGreaterThan(0);
    const found = await env.api('GET', '/admin/users?q=giulia@example', undefined, env.adminToken);
    expect(found.body.users[0].email).toBe('giulia@example.com');
    expect(found.body.users[0].passwordHash).toBeUndefined();
  });
});
