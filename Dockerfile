# Ambiente «tutto in uno»: API, motore AI, sito e app (versione web) in un solo servizio.
# Pensato per l'ambiente di prova e per le demo. In produzione le parti vanno su servizi separati (vedi README).

FROM node:22-bookworm-slim AS build
WORKDIR /srv
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
# Sito su /sito, app su /app, API su /api: tutto sullo stesso indirizzo.
RUN VITE_API_URL=/api VITE_BASE=/sito/ npm run build -w @motix/web
# Il sensore simulato è acceso: è un ambiente di prova, non la versione per gli store.
RUN cd apps/mobile && EXPO_PUBLIC_API_URL=/api EXPO_BASE_PATH=/app EXPO_PUBLIC_POD_SIMULATOR=1 EXPO_NO_TELEMETRY=1 CI=1 npx expo export --platform web

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY services/ai/requirements.txt services/ai/
RUN pip3 install --no-cache-dir --break-system-packages -r services/ai/requirements.txt
COPY --from=build /srv/node_modules node_modules
COPY --from=build /srv/package.json package.json
COPY --from=build /srv/tsconfig.base.json tsconfig.base.json
COPY --from=build /srv/packages packages
COPY --from=build /srv/apps/api apps/api
COPY --from=build /srv/apps/web/dist apps/web/dist
COPY --from=build /srv/apps/mobile/dist apps/mobile/dist
COPY services/ai services/ai
COPY scripts/start-all.sh scripts/start-all.sh
ENV NODE_ENV=production WEB_DIST=/srv/apps/web/dist APP_DIST=/srv/apps/mobile/dist AI_URL=http://127.0.0.1:8000 MEDIA_DIR=/tmp/motix-media
EXPOSE 4000
CMD ["sh", "scripts/start-all.sh"]
