# Yacht PMS MVP - Runbook

## Arquitectura breve
- **Monorepo Turborepo** con apps `api`, `web`, `mobile` y paquete `shared`.
- **API**: NestJS + Prisma + PostgreSQL + BullMQ/Redis.
- **Web**: Next.js App Router + Tailwind + base de componentes (incluyendo setup shadcn/ui).
- **Mobile**: Expo + navegación por tabs + SQLite para `pending_ops` offline.
- **Shared**: enums, roles, y schemas Zod base.
- **Extensión MVP**: Notificaciones + Timeline/Agenda por yacht sin charts.

## Requisitos
- Node 20+
- pnpm 9+
- PostgreSQL
- Redis

## Variables de entorno
- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/mobile/.env.example`

## Comandos
Desde la raíz:

```bash
pnpm install
pnpm dev
```

Comandos por app:

```bash
pnpm --filter @yacht-pms/api dev
pnpm --filter @yacht-pms/web dev
pnpm --filter @yacht-pms/mobile dev
```

## Auth
- Estrategia elegida: **Bearer tokens en headers** (`Authorization: Bearer <access_token>`).
- Endpoint base: `/api/auth/login` y `/api/auth/refresh`.

## Notificaciones
- Ver `docs/NOTIFICATIONS.md` para tipos de eventos, reglas de envío y pruebas locales con proveedor email mock.
