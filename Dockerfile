# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

RUN npm install --global pnpm@12.16.1
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node src ./src
COPY --chown=node:node db ./db
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM

CMD ["sh", "-c", "node scripts/migrate.js && exec node src/main.js"]
