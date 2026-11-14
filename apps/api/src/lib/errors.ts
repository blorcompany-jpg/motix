import type { ZodTypeAny, z } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, fields?: Record<string, string>) =>
  new AppError(422, code, message, fields);
export const unauthorized = (message = 'Accesso non autorizzato') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Non hai i permessi per questa operazione', code = 'forbidden') =>
  new AppError(403, code, message);
export const notFound = (message = 'Elemento non trovato') => new AppError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);

/** Valida i dati in ingresso; in caso di errore indica i campi sbagliati. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw badRequest('validation_error', 'Alcuni dati non sono corretti', fields);
}
