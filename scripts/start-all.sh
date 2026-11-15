#!/bin/sh
# Avvia il motore AI (raggiungibile solo dall'interno) e poi il server.
set -e
export AI_KEY="${AI_KEY:-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
(cd services/ai && AI_SERVICE_KEY="$AI_KEY" python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level warning) &
cd apps/api && exec npx tsx src/server.ts
