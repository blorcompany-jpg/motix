// Compila il server in un solo file JavaScript per l'ambiente di prova e la produzione.
// Avviarlo con `node` invece che con tsx dimezza la memoria usata (il piano gratuito di Render ha 512 MB).
// Il codice comune (@motix/shared) viene incluso; le altre librerie restano in node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/api/src/server.ts'],
  outfile: 'apps/api/dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  plugins: [
    {
      name: 'librerie-esterne',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith('@motix/') ? undefined : { path: args.path, external: true }));
      },
    },
  ],
  logLevel: 'info',
});
