# Yacht PMS MVP - Runbook

## Architecture
- Monorepo Turborepo with apps `api`, `web`, `mobile`, plus `packages/shared`.
- API: NestJS + Prisma + PostgreSQL + BullMQ/Redis.
- Web: Next.js App Router + Tailwind.
- Mobile: Expo.

## Requirements
- Node 20+
- pnpm 9+
- PostgreSQL
- Redis

## Env files
- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/mobile/.env.example`

## Commands
```bash
pnpm install
pnpm dev
```

Per app:
```bash
pnpm --filter @yacht-pms/api dev
pnpm --filter @yacht-pms/web dev
pnpm --filter @yacht-pms/mobile dev
```

## Auth
- Strategy: bearer tokens (`Authorization: Bearer <access_token>`).
- Base endpoints: `/api/auth/login`, `/api/auth/refresh`.

## Notifications (current)
- `docs/NOTIFICATIONS.md`

## Notifications + Jobs (phase 0)
- `plans/notifications-jobs-phase0-adr.md`
- `docs/NOTIFICATIONS_JOBS_EVENT_MAP.md`
- `docs/NOTIFICATIONS_JOBS_API_CONTRACT.md`
- `docs/NOTIFICATIONS_JOBS_PRISMA_DRAFT.md`
