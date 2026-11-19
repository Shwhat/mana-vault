FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY tsconfig.base.json ./
RUN npm ci

COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build

FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/mana-vault.sqlite \
    SCRYFALL_DATA_PATH=/data/default-cards.json \
    WEB_DIST_PATH=/app/apps/web/dist
WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist

RUN mkdir -p /data && chown 65532:65532 /data
USER 65532:65532
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "apps/server/dist/index.js", "-healthcheck"]
CMD ["node", "apps/server/dist/index.js"]
