# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

# ── base: Node + pnpm ────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable
WORKDIR /app

# ── deps: every dependency, plus the generated Prisma client ─────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml .pnpmfile.cjs prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ── migrate: the Prisma CLI and the migrations; run once before the app ──────
# A separate step, never the app's entrypoint: replicas starting together would race.
FROM deps AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── build: compile TypeScript ────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# ── prod-deps: production dependencies only ──────────────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml .pnpmfile.cjs ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

# ── runtime: minimal image, non-root ─────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
# liveness only: a container must not be restarted because the database is down
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/entrypoints/main.api.js"]
