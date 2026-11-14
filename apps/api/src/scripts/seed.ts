/** Crea il primo amministratore BTECH (ADMIN_EMAIL / ADMIN_PASSWORD). Si può rilanciare senza effetti. */
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config';
import { openDb } from '../db/client';
import { users } from '../db/schema';
import { hashPassword } from '../lib/password';

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
if (!email || password.length < 12) {
  console.error('Imposta ADMIN_EMAIL e ADMIN_PASSWORD (almeno 12 caratteri) nel file .env');
  process.exit(1);
}

const handle = await openDb(loadConfig().databaseUrl);
await handle.migrate();
const [existing] = await handle.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
if (existing) console.log(`Amministratore già presente: ${email}`);
else {
  await handle.db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
    firstName: 'Admin',
    lastName: 'BTECH',
    role: 'admin',
    emailVerifiedAt: new Date(),
  });
  console.log(`Amministratore creato: ${email}`);
}
await handle.close();
