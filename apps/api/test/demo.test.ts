import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo, seedDemoProfessionals } from '../src/services/demo';
import { createEnv, type TestEnv } from './helpers';

let env: TestEnv;
const PASSWORD = 'Demo-password-1';

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

describe('dati dell’ambiente di prova', () => {
  it('crea i dati di base e quelli dei professionisti, e non li duplica', async () => {
    const setClock = (ms: number) => (env.clock.now = new Date(Date.now() + ms));
    expect(await seedDemo(env.app, env.app.ctx, PASSWORD, '', setClock)).toBe(true);
    expect(await seedDemoProfessionals(env.app, env.app.ctx, PASSWORD, '')).toBe(true);
    expect(await seedDemoProfessionals(env.app, env.app.ctx, PASSWORD, '')).toBe(false);

    const login = async (email: string) => (await env.api('POST', '/auth/login', { email, password: PASSWORD })).body.accessToken as string;
    const giulia = await login('utente@motix.demo');
    const plan = (await env.api('GET', '/me/meal-plan', undefined, giulia)).body.plan;
    expect(plan).toMatchObject({ nutritionist: 'Sara Neri' });
    expect(plan.days[0].totals.kcal).toBeGreaterThan(1500);
    expect((await env.api('GET', '/me/check-ins', undefined, giulia)).body.checkIns[0].comment).toContain('panca');
    const owner = await login('struttura@motix.demo');
    expect((await env.api('GET', '/structure/packages', undefined, owner)).body.seatsAvailable).toBe(9);
    const nutri = await login('nutrizionista@motix.demo');
    expect((await env.api('GET', '/me', undefined, nutri)).body.trainer.canPrescribeNutrition).toBe(true);
  });
});
