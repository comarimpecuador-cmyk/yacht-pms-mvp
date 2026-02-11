# Logbook V2 Rollout (Operativo)

## 1) Migracion de base de datos
Desde la raiz del monorepo:

```bash
pnpm --filter @yacht-pms/api exec prisma generate
pnpm --filter @yacht-pms/api exec prisma migrate deploy
```

La migracion crea:
- `LogbookEventV2`
- `LogbookEventEvidenceV2`
- `LogbookEventAuditV2`
- enums `LogbookEventV2Type`, `LogbookEventV2Severity`, `LogbookEventV2Status`

## 2) Backfill legacy -> V2
Script idempotente (mantiene `legacyEntryId` + `rawJson`):

```bash
pnpm --filter @yacht-pms/api run logbook:v2:backfill
```

Piloto por yate:

```bash
pnpm --filter @yacht-pms/api run logbook:v2:backfill -- --yachtId=<UUID_YATE>
```

Modo simulacion:

```bash
pnpm --filter @yacht-pms/api run logbook:v2:backfill -- --dry-run
```

## 3) Feature flags
Variables en `apps/api/.env`:

- `LOGBOOK_V2_READ_ENABLED=true`
- `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=true`
- `LOGBOOK_V2_WRITE_DOUBLE_ENABLED=true`
- `LOGBOOK_LEGACY_WRITE_ENABLED=true`

Comportamiento:
- Lectura: `/api/logbook/v2/events` primero consulta V2 y si no hay data usa fallback legacy.
- Escritura: `POST /api/logbook/v2/events` guarda V2 y replica en legacy (double-write).
- Legacy read-only: con `LOGBOOK_LEGACY_WRITE_ENABLED=false`, los endpoints legacy de escritura se bloquean.
- Politica de conflicto: si legacy y V2 difieren, **legacy se preserva sin mutacion** y se registra `legacy_conflict` en `AuditEvent`.

## 4) Desactivar legacy (fase final)
Cuando el piloto este validado:

1. Ejecutar backfill completo.
2. Dejar `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=true` por ventana de estabilizacion.
3. Poner `LOGBOOK_LEGACY_WRITE_ENABLED=false`.
4. Cuando no haya misses legacy, poner `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=false`.

## 5) Endpoints V2
- `POST /api/logbook/v2/events`
- `GET /api/logbook/v2/events?yachtId=<uuid>&date=<yyyy-mm-dd>`
- `GET /api/logbook/v2/events/:id`
- `PATCH /api/logbook/v2/events/:id/status` (aprobacion/cierre con auditoria)

## 6) Roles operativos
- Crear evento V2: `Captain`, `Chief Engineer`, `Admin`, `SystemAdmin`
- Aprobar/Cerrar evento: `Captain`, `Admin`, `SystemAdmin`

## 7) Dashboard Home (conteos)
El home del yate (`/yachts/:id/home`) usa:

- `stats.logbookPending`: solo eventos `draft`
- `stats.logbookPendingReview`: solo eventos `submitted`

Reglas:
- Si `LOGBOOK_V2_READ_ENABLED=true`, se cuentan estados en `LogbookEventV2`.
- Si V2 no devuelve datos y `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=true`, se usa legacy:
  - `Draft -> draft`
  - `Submitted -> submitted`
  - `Locked -> closed`
  - `Corrected -> submitted`

## 8) Agenda con Logbook V2
La agenda (`/timeline`) ahora se alimenta por:

1. Alerts activas en rango.
2. Eventos `LogbookEventV2` en rango (fuente principal).
3. Fallback legacy (`LogBookEntry`) si no hay V2 y fallback habilitado.

Endpoints usados:
- `GET /api/timeline/:yachtId?windowDays=&from=&to=`
- `GET /api/timeline/fleet?windowDays=&from=&to=`

Rango por defecto:
- `windowDays` hacia atras y hacia adelante (simetrico).
- Si se envia `from/to`, se respeta ese rango.

## 9) Flags recomendados por fase
### Shadow (evaluacion)
- `LOGBOOK_V2_READ_ENABLED=true`
- `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=true`
- `LOGBOOK_V2_WRITE_DOUBLE_ENABLED=true`
- `LOGBOOK_LEGACY_WRITE_ENABLED=true`

### Piloto (operacion controlada)
- `LOGBOOK_V2_READ_ENABLED=true`
- `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=true`
- `LOGBOOK_V2_WRITE_DOUBLE_ENABLED=true`
- `LOGBOOK_LEGACY_WRITE_ENABLED=false`

### Estable (post estabilizacion)
- `LOGBOOK_V2_READ_ENABLED=true`
- `LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED=false`
- `LOGBOOK_V2_WRITE_DOUBLE_ENABLED=true`
- `LOGBOOK_LEGACY_WRITE_ENABLED=false`

## 10) Smoke manual recomendado
1. Crear 3 eventos V2 en un yate:
   - 2 con `workflow.status=draft`
   - 1 con `workflow.status=submitted`
2. Abrir `/yachts/:id/home` y validar:
   - `Borradores de bitacora = 2`
   - Subtexto `Pendientes de revision: 1`
3. Revisar `Actividad reciente`:
   - Items de bitacora con estado visible en descripcion (`[Borrador]`, `[Pendiente de revision]`, etc.).
4. Click en `Ver agenda`:
   - Debe cargar eventos del rango.
   - Si no hay datos, mostrar `No hay eventos para esta fecha/rango`.
5. Validar deep-link:
   - Item de agenda de bitacora abre `Ver detalle`.
