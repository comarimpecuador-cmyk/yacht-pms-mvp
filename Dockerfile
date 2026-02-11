# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS api-build
COPY . .
RUN pnpm --filter @yacht-pms/api exec prisma generate
RUN pnpm --filter @yacht-pms/api build

FROM deps AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @yacht-pms/web build

FROM api-build AS api
ENV NODE_ENV=production
WORKDIR /app
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @yacht-pms/api exec prisma generate && pnpm --filter @yacht-pms/api exec prisma migrate deploy && pnpm --filter @yacht-pms/api start:prod"]

FROM web-build AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@yacht-pms/web", "start"]
