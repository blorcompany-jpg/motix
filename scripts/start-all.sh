#!/bin/sh
# Avvia il motore AI (raggiungibile solo dall'interno) e poi il server.
# Pensato per stare nei 512 MB del piano gratuito di Render: server già compilato e memoria di Node limitata.
set -e
export AI_KEY="${AI_KEY:-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
export MIGRATIONS_DIR="${MIGRATIONS_DIR:-$PWD/apps/api/drizzle}"
(cd services/ai && AI_SERVICE_KEY="$AI_KEY" python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --log-level warning) &
cd apps/api
if [ -f dist/server.mjs ]; then
  exec node --max-old-space-size=${NODE_MAX_MB:-220} --enable-source-maps dist/server.mjs
else
  exec npx tsx src/server.ts
fi
