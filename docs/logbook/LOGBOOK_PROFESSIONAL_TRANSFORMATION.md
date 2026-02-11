# Logbook profesional v2 - analisis, schema y migracion

## 1) Campos actuales detectados (estado real del proyecto)
Analisis realizado sobre `apps/api/prisma/schema.prisma` y modulo `logbook`.

### Entidades actuales relevantes
- `Yacht`: `id`, `name`, `flag`, `imoOptional`, `isActive`.
- `LogBookEntry`: `id`, `yachtId`, `entryDate`, `watchPeriod`, `status`, `createdBy`, `createdAt`, `updatedAt`.
- `LogBookObservation`: `id`, `logbookId`, `category`, `text`.
- `LogBookEngineReading`: `id`, `logbookId`, `engineId`, `hours`.
- `Engine`: `id`, `yachtId`, `name`, `type`, `serialNo`.
- `EngineCounter`: historial de horas de motor por fecha.
- `AuditEvent`: auditoria generica (`module`, `entityType`, `action`, `actorId`, `timestamp`, `beforeJson`, `afterJson`, `source`).

### Lo que YA existe
- Relacion por yate.
- Fecha de evento (`entryDate`) + periodo de guardia.
- Estado de workflow (`Draft`, `Submitted`, `Locked`, `Corrected`).
- Responsable inicial (`createdBy`) y datos del creador por `include`.
- Observaciones por categoria y texto.
- Lecturas de motor por evento.
- Auditoria de submit/lock en tabla `AuditEvent`.

### Lo que FALTA para una bitacora maritima moderna
- Metadatos nauticos completos (matricula estandar, tipo formal, puerto base obligatorio).
- `eventType` y `eventSubType` consistentes y normalizados.
- Coordenadas GPS obligatorias por evento (o fuente de ubicacion trazable).
- Evidencias estructuradas (foto/video/pdf con metadata y hash).
- Responsables extendidos (`assignedTo`, `approvedBy`, `acknowledgedBy`).
- Auditoria detallada por campo cambiado y motivo de cambio.
- Correlacion operativa con mantenimiento/servicio/incidentes en objetos propios.

---

## 2) Salida A: estructura objetivo (JSON Schema + migracion logica)

### JSON Schema
Se genero en:
- `docs/logbook/modern-logbook-event.schema.json`

Resumen de bloques del schema:
- `yacht`: metadatos de embarcacion.
- `chronology`: tiempo del evento y secuencia.
- `classification`: tipo/subtipo/categoria/severidad.
- `workflow`: estado y aprobaciones.
- `responsibility`: quien reporta/asigna/aprueba.
- `location`: lat/lon + fuente + puerto/area.
- `details`: contenido tecnico (incluye lecturas de motor y refs a mantenimiento/incidente/servicio).
- `evidence[]`: archivos y trazabilidad.
- `audit`: historial de cambios estructurado.

### Matriz de mapeo (actual -> nuevo)
| Fuente actual | Campo actual | Nuevo campo | Regla de mapeo |
|---|---|---|---|
| `LogBookEntry` | `id` | `legacyRefs.legacyEntryId` | Copia directa para trazabilidad |
| `LogBookEntry` | `yachtId` | `yacht.yachtId` | Copia directa |
| `Yacht` | `name` | `yacht.name` | Copia directa |
| `Yacht` | `imoOptional` | `yacht.imo` | Copia si existe |
| `Yacht` | `flag` | `yacht.flag` | Copia directa |
| `LogBookEntry` | `entryDate` | `chronology.occurredAt` | Copia directa (UTC) |
| `LogBookEntry` | `createdAt` | `chronology.loggedAt` / `audit.createdAt` | Copia directa |
| `LogBookEntry` | `watchPeriod` | `chronology.watchPeriod` | Normalizar al enum; si no coincide -> `custom` |
| `LogBookEntry` | `status` | `workflow.status` | `Draft->draft`, `Submitted->submitted`, `Locked->closed`, `Corrected->submitted` |
| `LogBookEntry` + `Observation` | `category`, `text` | `classification.*` + `details.*` | Clasificacion por reglas de categoria |
| `LogBookEngineReading` | `engineId`, `hours` | `details.engineReadings[]` | Enriquecer con `engineName` por join |
| `LogBookEntry` | `createdBy` | `responsibility.reportedByUserId` | Copia directa |
| `User` | `fullName` | `responsibility.reportedByName` | Join por `createdBy` |
| `AuditEvent` | `actorId`, `timestamp`, `action` | `audit.changeHistory[]` | Transformar eventos historicos |

### Campos faltantes y como llenarlos
| Campo nuevo requerido | Existe hoy | Estrategia |
|---|---|---|
| `yacht.registrationNo` | No | Tomar de maestro de flota o carga manual inicial |
| `yacht.yachtType` | No formal | Diccionario de tipos por yate |
| `yacht.homePort` | No | Backfill desde catalogo de operaciones |
| `classification.eventType` | No | Regla por categoria/keywords (ver abajo) |
| `classification.eventSubType` | No | Regla por categoria/keywords + validacion manual en incidentes |
| `location.latitude/longitude` | No | Integrar feed GPS o captura manual obligatoria |
| `evidence[]` | Parcial en otros modulos | Inicialmente vacio y obligatorio solo en `incident`/`maintenance` criticos |
| `audit.lastChangeReason` | No | Requerir texto en UI en cada edicion |

### Reglas de clasificacion recomendadas
1. Si `observation.category` contiene `incident|accident|safety|security` -> `eventType=incident`.
2. Si contiene `maintenance|repair|engine` -> `eventType=maintenance`.
3. Si contiene `guest|service|charter` -> `eventType=service`.
4. Si contiene `arrival|entry|arribo` -> `eventType=entry`.
5. Si contiene `departure|exit|zarpe` -> `eventType=exit`.
6. Caso contrario -> `eventType=operation`.

---

## 3) Salida B: datos transformados de ejemplo
Se genero en:
- `docs/logbook/modern-logbook-sample-records.json`

Contenido:
- 10 registros coherentes con el schema.
- Incluye tipos: `entry`, `exit`, `service`, `maintenance`, `incident`, `operation`.
- Incluye workflow, responsables, GPS, evidencia y auditoria.

---

## 4) Campos obligatorios y opcionales (recomendacion operativa)

### Obligatorios por evento
- `eventId` (UUID)
- `yacht.yachtId`, `yacht.name`, `yacht.registrationNo`, `yacht.yachtType`, `yacht.homePort`
- `chronology.occurredAt`, `chronology.loggedAt`, `chronology.timezone`, `chronology.sequenceNo`
- `classification.eventType`, `classification.eventSubType`, `classification.category`, `classification.severity`
- `workflow.status`, `workflow.approvalRequired`
- `responsibility.reportedByUserId`, `responsibility.reportedByName`
- `details.title`, `details.description`
- `audit.createdAt`, `audit.createdByUserId`, `audit.updatedAt`, `audit.updatedByUserId`, `audit.changeHistory`

### Opcionales (segun tipo de evento)
- `details.engineReadings[]` (muy recomendado en `operation` y `maintenance`)
- `details.maintenanceRef` (obligatorio para `maintenance`)
- `details.incidentRef` (obligatorio para `incident`)
- `details.serviceRef` (obligatorio para `service`)
- `evidence[]` (obligatorio cuando `severity=critical` o `eventType=incident`)

### Validaciones criticas
- `latitude`: `-90..90`, `longitude`: `-180..180`.
- UUID valido para todos los `*UserId`, `eventId`, `yachtId`, `taskId`, `engineId`.
- `workflow.status` limitado a: `draft|submitted|approved|rejected|closed|cancelled`.
- `classification.severity` limitado a: `info|warn|critical`.
- `occurredAt <= loggedAt`.
- `audit.changeHistory[*].reason` obligatorio, minimo 3 caracteres.
- Si `eventType=incident` y `severity=critical`, exigir al menos 1 evidencia.

---

## 5) Mockups UI (brief para diseno)
> Cada punto esta descrito como "imagen con -" para uso directo por UX/UI.

1. **Linea de tiempo diaria**
- imagen con - fondo azul marino oscuro, header con nombre del yate y fecha, linea vertical central con nodos por hora.
- imagen con - tarjetas por evento a izquierda/derecha, iconos por tipo (ancla entrada/salida, llave mantenimiento, escudo incidente, bandeja servicio).
- imagen con - chips de severidad (verde informativa, ambar advertencia, rojo critica), GPS en texto pequeno y usuario responsable.
- imagen con - boton flotante "Nuevo evento" y switch "Solo criticos".

2. **Detalle de evento con evidencia y estado**
- imagen con - layout en dos columnas: izquierda datos del evento, derecha galeria de evidencias.
- imagen con - barra superior con breadcrumb, estado workflow y ultimo cambio de auditoria.
- imagen con - panel "Responsables" (reporta/asigna/aprueba) con avatar e ID.
- imagen con - panel "Auditoria" tipo tabla (cuando, quien, campo, razon).

3. **Dashboard de resumen por yate**
- imagen con - cards KPI arriba (eventos hoy, incidentes criticos, mantenimientos abiertos, servicios completados).
- imagen con - grafico de barras por `eventType` y grafico de dona por severidad.
- imagen con - tabla inferior con ultimos 20 eventos y columna de SLA/estado.
- imagen con - paleta: navy + cian para info + ambar warn + rojo critical.

4. **Filtro interactivo fecha/tipo/estado**
- imagen con - barra de filtros sticky en la parte superior con date-range, tipo, sub-tipo, severidad, estado y responsable.
- imagen con - contador dinamico de resultados y boton "Guardar vista".
- imagen con - chips activos removibles y boton "Limpiar filtros".
- imagen con - modo mobile en acordeon con filtros plegables.

---

## 6) Ejemplo Node.js + PostgreSQL + Prisma (migracion)

### 6.1 Prisma models sugeridos (v2)
```prisma
model LogbookEventV2 {
  id              String   @id @default(uuid())
  yachtId         String
  occurredAt      DateTime
  loggedAt        DateTime
  timezone        String
  sequenceNo      Int
  eventType       String
  eventSubType    String
  category        String
  severity        String
  workflowStatus  String
  approvalLevel   String?
  title           String
  description     String
  locationSource  String?
  latitude        Float?
  longitude       Float?
  reportedByUserId String
  assignedToUserId String?
  approvedByUserId String?
  legacyEntryId   String?
  rawJson         Json
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  evidences       LogbookEventEvidenceV2[]
  audits          LogbookEventAuditV2[]

  @@index([yachtId, occurredAt])
  @@index([eventType, severity])
}

model LogbookEventEvidenceV2 {
  id          String   @id @default(uuid())
  eventId     String
  event       LogbookEventV2 @relation(fields: [eventId], references: [id], onDelete: Cascade)
  fileUrl     String
  fileName    String
  mimeType    String
  checksumSha256 String?
  uploadedByUserId String
  uploadedAt  DateTime
  caption     String?
}

model LogbookEventAuditV2 {
  id              String   @id @default(uuid())
  eventId         String
  event           LogbookEventV2 @relation(fields: [eventId], references: [id], onDelete: Cascade)
  changedAt       DateTime
  changedByUserId String
  changeType      String
  changedFields   String[]
  reason          String
}
```

### 6.2 Script de migracion (ejemplo)
```ts
import { PrismaClient, LogBookStatus } from '@prisma/client';

const prisma = new PrismaClient();

function mapStatus(status: LogBookStatus): string {
  if (status === 'Draft') return 'draft';
  if (status === 'Submitted') return 'submitted';
  if (status === 'Locked') return 'closed';
  return 'submitted';
}

function classify(category: string, text: string) {
  const s = `${category} ${text}`.toLowerCase();
  if (/(incident|accident|safety|security)/.test(s)) return { eventType: 'incident', eventSubType: 'safety_incident', category: 'safety', severity: 'warn' };
  if (/(maintenance|repair|engine)/.test(s)) return { eventType: 'maintenance', eventSubType: 'corrective_maintenance', category: 'engineering', severity: 'warn' };
  if (/(service|guest|charter)/.test(s)) return { eventType: 'service', eventSubType: 'charter_service', category: 'guest_ops', severity: 'info' };
  if (/(arrival|entry|arribo)/.test(s)) return { eventType: 'entry', eventSubType: 'port_arrival', category: 'nautical', severity: 'info' };
  if (/(departure|exit|zarpe)/.test(s)) return { eventType: 'exit', eventSubType: 'port_departure', category: 'nautical', severity: 'info' };
  return { eventType: 'operation', eventSubType: 'navigation_note', category: 'nautical', severity: 'info' };
}

async function migrateLogbook() {
  const entries = await prisma.logBookEntry.findMany({
    include: {
      yacht: true,
      creator: true,
      observations: true,
      engineReadings: { include: { engine: true } },
    },
    orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
  });

  for (const entry of entries) {
    const sortedObs = [...entry.observations];

    for (let i = 0; i < sortedObs.length; i += 1) {
      const obs = sortedObs[i];
      const cls = classify(obs.category, obs.text);

      await prisma.logbookEventV2.create({
        data: {
          yachtId: entry.yachtId,
          occurredAt: entry.entryDate,
          loggedAt: entry.createdAt,
          timezone: 'UTC',
          sequenceNo: i + 1,
          eventType: cls.eventType,
          eventSubType: cls.eventSubType,
          category: cls.category,
          severity: cls.severity,
          workflowStatus: mapStatus(entry.status),
          approvalLevel: entry.status === 'Submitted' || entry.status === 'Locked' ? 'captain' : null,
          title: `${obs.category} - ${entry.watchPeriod}`.slice(0, 160),
          description: obs.text,
          reportedByUserId: entry.createdBy,
          legacyEntryId: entry.id,
          rawJson: {
            legacyEntryId: entry.id,
            legacyObservationId: obs.id,
            watchPeriod: entry.watchPeriod,
            engines: entry.engineReadings.map((r) => ({ engineId: r.engineId, engineName: r.engine.name, hours: r.hours })),
            yachtName: entry.yacht.name,
            yachtFlag: entry.yacht.flag,
            creatorName: entry.creator.fullName,
          },
          audits: {
            create: {
              changedAt: entry.createdAt,
              changedByUserId: entry.createdBy,
              changeType: 'create',
              changedFields: ['title', 'description', 'workflowStatus'],
              reason: 'Migracion inicial desde logbook legacy',
            },
          },
        },
      });
    }
  }
}

migrateLogbook()
  .then(() => console.log('Migracion logbook completada'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
```

### 6.3 Query SQL util para discovery inicial (si tu fuente es DB)
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('LogBookEntry', 'LogBookObservation', 'LogBookEngineReading', 'Engine', 'AuditEvent')
ORDER BY table_name, ordinal_position;
```

---

## 7) Roadpaper corto de implementacion recomendada
1. Congelar catalogos (`eventType`, `eventSubType`, `workflow.status`) y validaciones.
2. Crear tablas v2 en paralelo (no romper legacy).
3. Ejecutar migracion batch por ventanas de fecha + `rawJson` de respaldo.
4. Correr validacion automatica (schema validation + conteos por yate/dia).
5. Activar doble escritura temporal (legacy + v2) durante 2-4 semanas.
6. Cambiar UI a lectura v2 y mantener fallback legacy solo lectura.
7. Decomisionar legacy cuando KPI de calidad > 99.5% sin errores criticos.

---

## 8) Archivos generados en este entregable
- `docs/logbook/modern-logbook-event.schema.json`
- `docs/logbook/modern-logbook-sample-records.json`
- `docs/logbook/LOGBOOK_PROFESSIONAL_TRANSFORMATION.md`
