# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.19.0
ARG NPM_VERSION=11.6.0

FROM node:${NODE_VERSION}-alpine AS base
ARG NPM_VERSION
WORKDIR /app/server
ENV npm_config_update_notifier=false
RUN npm install -g npm@${NPM_VERSION} && npm --version && node --version

FROM base AS deps
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY package.json ./package.json
COPY shared ./shared
COPY server ./server
WORKDIR /app/server
RUN rm -rf dist && npm run build

FROM base AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist ./dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-2567}/healthz" > /dev/null || exit 1
CMD ["node", "--env-file-if-exists=.env", "dist/server/src/index.js"]
