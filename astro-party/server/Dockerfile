# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install

FROM deps AS build
WORKDIR /app
COPY package.json ./package.json
COPY shared ./shared
COPY server ./server
WORKDIR /app/server
RUN rm -rf dist && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
EXPOSE 2567
CMD ["node", "dist/server/src/index.js"]
