# Inventario API Frontend/Backend

Fecha: 2026-02-10

## 1) APIs del backend usadas hoy por el frontend (con UX)

Base real en frontend: `apps/web/lib/api.ts` (prefijo automatico `/api`).

| Endpoint | Metodo | Pantalla/flujo UX | Para que sirve en gestion de yates |
|---|---|---|---|
| `/api/auth/login` | POST | Login | Abre sesion con cookies HTTP-only. |
| `/api/auth/me` | GET | Bootstrap de sesion, guards | Obtiene usuario actual, rol y alcance por yate. |
| `/api/auth/refresh` | POST | Renovacion silenciosa | Evita logout agresivo por expiracion de access token. |
| `/api/auth/logout` | POST | Cerrar sesion/cambio de usuario | Limpia sesion anterior para evitar mezcla de cookies. |
| `/api/yachts` | GET | Dashboard/Yates/Topbar/Settings users | Lista yates visibles segun rol y acceso. |
| `/api/yachts` | POST | Modal "Nuevo yate" | Alta de yate (ahora restringido a SystemAdmin). |
| `/api/yachts/:id` | PATCH | Modal "Editar yate" | Cambia nombre, bandera, estado activo/inactivo, IMO. |
| `/api/yachts/:id/summary` | GET | `yachts/[id]/home` | KPIs por yate (bitacora, alertas, tripulacion, etc). |
| `/api/yachts/:id/access` | GET | `yachts/[id]/crew` | Ver tripulacion con acceso al yate. |
| `/api/yachts/:id/access` | POST | Modal "Agregar usuario a yate" | Asignar tripulante/usuario a un yate. |
| `/api/yachts/:id/access/:uid` | PATCH | Modal "Editar rol" | Ajusta rol override por yate. |
| `/api/yachts/:id/access/:uid` | DELETE | `yachts/[id]/crew` | Revoca acceso de usuario en un yate. |
| `/api/users` | GET | `settings/users` | Lista usuarios globales con estado y conteo de yates. |
| `/api/users` | POST | `settings/users` -> "Crear usuario" | Alta de usuario global. |
| `/api/users/:id/status` | PATCH | `settings/users` -> activar/desactivar | Control de estado operativo del usuario. |
| `/api/users/:id/accesses` | GET | `settings/users` -> asignaciones | Consulta asignaciones por yate (incluye revocados). |
| `/api/users/:id/accesses` | PUT | `settings/users` -> guardar asignaciones | Define asignaciones por yate para un usuario. |
| `/api/engines?yachtId=...` | GET | `yachts/[id]/engines`, `yachts/[id]/logbook` | Lista motores por yate. |
| `/api/engines` | POST | Modal "Agregar motor" | Alta de motor por yate. |
| `/api/engines/:id` | PATCH | Modal "Editar motor" | Edicion de motor por yate. |
| `/api/engines/:id` | DELETE | `yachts/[id]/engines` | Baja de motor. |
| `/api/logbook/entries?yachtId=...` | GET | `yachts/[id]/logbook` | Lista entradas de bitacora del yate. |
| `/api/logbook/entries` | POST | `yachts/[id]/logbook` | Crea entrada de bitacora. |
| `/api/logbook/entries/:id` | GET | `yachts/[id]/logbook` (detalle) | Ver detalle de entrada concreta. |
| `/api/logbook/entries/:id` | PATCH | `yachts/[id]/logbook` (edicion rapida) | Ajustar entrada Draft/Corrected. |
| `/api/logbook/entries/:id/submit` | POST | `yachts/[id]/logbook` | Enviar entrada para revision antes de lock. |
| `/api/logbook/entries/:id/lock` | POST | `yachts/[id]/logbook` | Bloquea entrada cerrada de bitacora. |
| `/api/alerts/:yachtId` | GET | `timeline` | Alertas operativas por yate para priorizar riesgo. |
| `/api/timeline/:yachtId?windowDays=` | GET | `timeline` | Agenda consolidada por yate (vencimientos/tareas). |
| `/api/timeline/fleet?windowDays=&yachtId=` | GET | `timeline` (solo SystemAdmin) | Agenda global multi-yate para supervision de flota. |
| `/api/notifications/in-app` | GET | Topbar (campana) | Bandeja in-app del usuario autenticado. |
| `/api/notifications/:id/read` | PATCH | Topbar (campana) | Marcar notificacion como leida. |
| `/api/notifications/settings` | GET | `settings/notifications` | Leer preferencias del usuario autenticado. |
| `/api/notifications/settings` | POST | `settings/notifications` | Guardar preferencias de notificaciones. |
| `/api/maintenance/status` | GET | `yachts/[id]/maintenance` | Estado de disponibilidad del modulo mantenimiento. |
| `/api/maintenance/tasks?yachtId=&status=` | GET | `yachts/[id]/maintenance` | Listar tareas de mantenimiento por yate y estado. |
| `/api/maintenance/tasks` | POST | `yachts/[id]/maintenance` | Crear tarea de mantenimiento. |
| `/api/maintenance/tasks/:id` | GET | `yachts/[id]/maintenance` | Ver detalle de tarea de mantenimiento. |
| `/api/maintenance/tasks/:id` | PATCH | `yachts/[id]/maintenance` | Editar tarea (titulo/fecha/prioridad/asignacion). |
| `/api/maintenance/tasks/:id/submit` | POST | `yachts/[id]/maintenance` | Enviar tarea a aprobacion. |
| `/api/maintenance/tasks/:id/approve` | POST | `yachts/[id]/maintenance` | Aprobar tarea enviada. |
| `/api/maintenance/tasks/:id/reject` | POST | `yachts/[id]/maintenance` | Rechazar tarea con motivo. |
| `/api/maintenance/tasks/:id/complete` | POST | `yachts/[id]/maintenance` | Cerrar tarea completada. |
| `/api/maintenance/tasks/:id/evidences` | POST | `yachts/[id]/maintenance` | Adjuntar evidencia a tarea. |
| `/api/maintenance/summary/:yachtId` | GET | `yachts/[id]/maintenance` | KPIs de mantenimiento por yate. |
| `/api/documents/status` | GET | `yachts/[id]/documents` | Estado de disponibilidad del modulo documentos. |
| `/api/documents?yachtId=&status=` | GET | `yachts/[id]/documents` | Listar documentos por yate y estado. |
| `/api/documents` | POST | `yachts/[id]/documents` | Crear documento/certificado. |
| `/api/documents/:id` | GET | `yachts/[id]/documents` | Ver detalle documental. |
| `/api/documents/:id` | PATCH | `yachts/[id]/documents` | Actualizar metadatos/documento. |
| `/api/documents/:id/archive` | POST | `yachts/[id]/documents` | Archivar documento. |
| `/api/documents/:id/evidences` | POST | `yachts/[id]/documents` | Adjuntar evidencia documental. |
| `/api/documents/:id/renewals` | POST | `yachts/[id]/documents` | Iniciar proceso de renovacion. |
| `/api/documents/:id/renewals/:renewalId` | PATCH | `yachts/[id]/documents` | Cerrar/actualizar renovacion. |
| `/api/documents/summary/:yachtId` | GET | `yachts/[id]/documents` | KPIs documentales por yate. |
| `/api/hrm/status` | GET | `yachts/[id]/hrm` | Estado funcional del modulo RRHH. |
| `/api/hrm/crew-options?yachtId=` | GET | `yachts/[id]/hrm` | Obtener tripulacion del yate para formularios RRHH. |
| `/api/hrm/schedules?yachtId=` | GET | `yachts/[id]/hrm` | Listar horarios de trabajo por yate. |
| `/api/hrm/schedules` | POST | `yachts/[id]/hrm` | Crear horario de trabajo. |
| `/api/hrm/schedules/:id` | PATCH | `yachts/[id]/hrm` | Editar horario existente. |
| `/api/hrm/rest-hours/report?yachtId=` | GET | `yachts/[id]/hrm` | Reporte de cumplimiento de descanso. |
| `/api/hrm/rest-hours/declarations` | POST | `yachts/[id]/hrm` | Declarar horas trabajadas/descanso. |
| `/api/hrm/leaves?yachtId=` | GET | `yachts/[id]/hrm` | Listar solicitudes de permisos/ausencias. |
| `/api/hrm/leaves` | POST | `yachts/[id]/hrm` | Crear solicitud de permiso/ausencia. |
| `/api/hrm/leaves/:id/approve` | POST | `yachts/[id]/hrm` | Aprobar solicitud de permiso. |
| `/api/hrm/leaves/:id/reject` | POST | `yachts/[id]/hrm` | Rechazar solicitud de permiso. |
| `/api/hrm/payrolls?yachtId=` | GET | `yachts/[id]/hrm` | Listar nominas por yate y periodo. |
| `/api/hrm/payrolls/generate` | POST | `yachts/[id]/hrm` | Generar nomina de periodo. |
| `/api/hrm/payrolls/:id` | GET | `yachts/[id]/hrm` | Ver detalle de nomina. |
| `/api/hrm/payrolls/:id/publish` | POST | `yachts/[id]/hrm` | Publicar nomina generada. |

## 2) APIs existentes en backend que no tienen UX activa en frontend

| Endpoint | Metodo | Estado UX | Como ayuda a gestion de yates |
|---|---|---|---|
| `/api/health` | GET | Sin UX (infra) | Healthcheck del servicio API. |
| `/api/queue/dummy` | POST | Sin UX (infra/dev) | Prueba del sistema de colas. |
| `/api/auth/debug/cookies` | GET | Sin UX (diagnostico) | Diagnostico de recepcion de cookies en backend. |
| `/api/yachts/:id` | GET | Sin UX directa | Leer detalle de un yate especifico. |
| `/api/notifications/in-app/:userId` | GET | Sin UX directa | Bandeja de notificaciones por usuario. |
| `/api/notifications/settings/:userId` | GET | Sin UX directa | Leer preferencias de notificaciones. |
| `/api/notifications/settings/:userId` | POST | Sin UX directa | Guardar preferencias de notificaciones. |
| `/api/manifest/status` | GET | Sin UX directa | Estado del modulo manifiestos. |
| `/api/working-days/status` | GET | Sin UX directa | Estado del modulo de jornadas. |
| `/api/requisitions/status` | GET | Sin UX directa | Estado del modulo requisiciones. |
| `/api/ism/status` | GET | Sin UX directa | Estado del modulo ISM. |
| `/api/users/by-email` | POST | Sin UX directa | Buscar usuario por email (payload). |
| `/api/users/by-email/:email` | GET | Sin UX directa | Buscar usuario por email (path). |

## 3) Recomendacion de priorizacion UX

1. Consolidar un tablero SysAdmin multi-yate con `alerts + timeline + summary` en una sola vista.
2. Añadir acciones de resolucion/ack de alertas para cerrar ciclo operativo.
3. Exponer estados `manifest/working-days/requisitions/ism` en dashboard de gobierno.
4. Mantener endpoints `:userId` de notifications como compatibilidad y migrar clientes a endpoints de usuario autenticado.

## 4) Cobertura contra modulos Deep Blue (8 modulos)

Basado en controladores reales de `apps/api/src/modules/*` y `apps/api/src/app.module.ts`.

| Modulo Deep Blue | Estado API actual | Endpoints actuales relacionados | Brecha principal |
|---|---|---|---|
| CORE | Parcial alto | `/api/yachts*`, `/api/users*`, `/api/yachts/:id/access*`, `/api/documents*`, `/api/timeline*` | Ya hay base documental operativa; faltan contactos, guests list y estructura completa de technical docs por taxonomy. |
| HRM | Parcial funcional | `/api/hrm/*`, `/api/working-days/status` | Ya hay horarios, descanso, permisos y nomina base; falta capa avanzada de reglas maritimas/payslips completos. |
| PMS | Parcial funcional | `/api/logbook/entries*`, `/api/engines*`, `/api/maintenance/*`, `/api/requisitions/status` | Maintenance ya opera; faltan spare parts, inventories, equipment list, purchase orders y requisitions full workflow. |
| FINANCE | No implementado | (sin controlador dedicado) | Faltan accounting, financial reports y budgets. |
| ISM | Parcial bajo | `/api/ism/status` | Falta ISM funcional (procedures/reports/records/contacts). |
| CHARTER | No implementado | (sin controlador dedicado) | Faltan charter accounting, calendar y reporting. |
| FLEET | Parcial | `/api/yachts`, `/api/yachts/:id/summary`, `/api/timeline/fleet`, `/api/alerts/:yachtId` | Hay vista global basica; faltan KPIs historicos y analytics de flota mas profundos. |
| SYNC | No implementado | (sin modulo sync), solo `/api/queue/dummy` tecnico | Faltan APIs de sync master/local server y estado de sincronizacion. |

## 5) Conclusiones rapidas

1. No tenemos APIs para todos los modulos de las laminas; hoy hay cobertura fuerte en `CORE basico` (usuarios/yates/accesos), `PMS logbook + engines` y `FLEET basico`.
2. `Maintenance`, `Documents` y `HRM` ya tienen implementacion funcional base para uso operativo por yate.
3. `FINANCE`, `CHARTER` y `SYNC` no tienen modulo funcional API aun.
4. Si tomamos esas laminas como objetivo producto, falta construir una fase de APIs por dominio antes de cerrar UX completa.

## 6) Backlog API minimo sugerido (por impacto operativo)

1. PMS siguiente fase: conectar `maintenance` con timeline consolidado y counters/logbook automativos.
2. CORE documental siguiente fase: taxonomy por tipo documental + versionado + upload binario (storage) sin depender solo de URL.
3. HRM siguiente fase: reglas maritimas de cumplimiento, calculo payroll detallado y exportes/payslips.
4. Requisitions/Purchase Orders: pasar de `status` a flujo real (draft, submit, approve, reject, order).
5. ISM real: procedimientos, reportes de incidente, registros y firmas.
6. Fleet analytics: endpoint agregado por flota (alertas, compliance, mantenimiento, dotacion).

## 7) Blueprint Fase 1 (Maintenance + Documents + HRM)

Objetivo: habilitar gestion operativa real por yate, con trazabilidad (audit), alcance por yate (scope), y notificaciones.

Estado actual: implementacion base operativa realizada (backend + frontend) en febrero 2026.

### 7.1 Convenciones comunes

1. Todos los endpoints van bajo `/api/*` y usan JWT/cookies actuales.
2. Todo endpoint de dominio operativo recibe `yachtId` por query o payload, excepto cuando el recurso ya lo implica por `:id`.
3. Todas las mutaciones crean `AuditEvent` con `beforeJson` y `afterJson`.
4. Se conserva compatibilidad de endpoints `*/status` para no romper UX existente.
5. Errores base:
   - `400` validacion
   - `401` no autenticado
   - `403` sin rol/scope
   - `404` recurso no encontrado
   - `409` conflicto de estado/flujo

### 7.2 Maintenance API (PMS Planned Maintenance)

#### Endpoints propuestos

| Endpoint | Metodo | Uso |
|---|---|---|
| `/api/maintenance/tasks?yachtId=&status=&dueFrom=&dueTo=&assignedTo=` | GET | Listado con filtros por estado/vencimiento/responsable. |
| `/api/maintenance/tasks` | POST | Crear tarea de mantenimiento planificada. |
| `/api/maintenance/tasks/:id` | GET | Detalle de tarea. |
| `/api/maintenance/tasks/:id` | PATCH | Editar tarea (campos permitidos segun estado). |
| `/api/maintenance/tasks/:id/submit` | POST | Enviar tarea para aprobacion. |
| `/api/maintenance/tasks/:id/approve` | POST | Aprobar tarea enviada. |
| `/api/maintenance/tasks/:id/reject` | POST | Rechazar tarea con motivo. |
| `/api/maintenance/tasks/:id/complete` | POST | Marcar tarea completada con resultado. |
| `/api/maintenance/tasks/:id/evidences` | POST | Adjuntar evidencia (URL de archivo). |
| `/api/maintenance/summary/:yachtId` | GET | KPIs por yate (pending, overdue, completed). |
| `/api/maintenance/calendar/:yachtId?windowDays=` | GET | Agenda de mantenimiento para timeline. |

#### Payload minimo sugerido

`POST /api/maintenance/tasks`
```json
{
  "yachtId": "uuid",
  "title": "Change fuel filters",
  "description": "Main engine monthly service",
  "engineId": "uuid",
  "systemTag": "ENGINE.FUEL",
  "priority": "High",
  "dueDate": "2026-03-10T00:00:00.000Z",
  "assignedToUserId": "uuid",
  "intervalType": "RunningHours",
  "intervalValue": 250
}
```

`POST /api/maintenance/tasks/:id/complete`
```json
{
  "completedAt": "2026-03-09T10:30:00.000Z",
  "workHours": 2.5,
  "notes": "Completed without issues"
}
```

#### Estados recomendados

`Draft -> Submitted -> Approved -> InProgress -> Completed`

Desvios:
`Submitted -> Rejected`, `Approved -> Cancelled`

### 7.3 Documents API (CORE Yacht/Technical Docs)

#### Endpoints propuestos

| Endpoint | Metodo | Uso |
|---|---|---|
| `/api/documents?yachtId=&status=&docType=&expiringInDays=` | GET | Listar documentos por yate con filtros de vencimiento. |
| `/api/documents` | POST | Crear documento/certificado. |
| `/api/documents/:id` | GET | Ver detalle de documento. |
| `/api/documents/:id` | PATCH | Actualizar metadata (expiry, assignee, status). |
| `/api/documents/:id/archive` | POST | Archivar documento (soft delete). |
| `/api/documents/:id/evidences` | POST | Subir evidencia (usa `fileUrl`). |
| `/api/documents/:id/renewals` | POST | Iniciar renovacion. |
| `/api/documents/:id/renewals/:renewalId` | PATCH | Cerrar/actualizar renovacion. |
| `/api/documents/summary/:yachtId` | GET | KPIs de cumplimiento documental por yate. |
| `/api/documents/expiring/:yachtId?days=` | GET | Vencimientos proximos para dashboard/timeline. |

#### Payload minimo sugerido

`POST /api/documents`
```json
{
  "yachtId": "uuid",
  "docType": "Registry Certificate",
  "identifier": "REG-2026-001",
  "issuedAt": "2026-01-15T00:00:00.000Z",
  "expiryDate": "2027-01-14T00:00:00.000Z",
  "assignedToUserId": "uuid"
}
```

`POST /api/documents/:id/evidences`
```json
{
  "fileUrl": "https://storage/path/file.pdf",
  "comment": "Signed by captain"
}
```

#### Reglas clave

1. Si `expiryDate` entra en ventana (`<= 30 dias`), crear alerta operativa.
2. Si se completa renovacion, actualizar estado a `Renewed` y registrar evidencia.
3. Cambios de estado generan evento para timeline.

### 7.4 HRM API (Working Schedules, Rest, Leaves, Payroll)

#### Endpoints propuestos

| Endpoint | Metodo | Uso |
|---|---|---|
| `/api/hrm/schedules?yachtId=&from=&to=&userId=` | GET | Ver horario de trabajo por tripulante/rango. |
| `/api/hrm/schedules` | POST | Crear bloque de horario (dia/turno). |
| `/api/hrm/schedules/:id` | PATCH | Ajustar horario existente. |
| `/api/hrm/rest-hours/report?yachtId=&userId=&from=&to=` | GET | Reporte de cumplimiento de horas de descanso. |
| `/api/hrm/rest-hours/declarations` | POST | Declaracion diaria de trabajo/descanso. |
| `/api/hrm/leaves?yachtId=&status=&from=&to=` | GET | Listar solicitudes de leave/rest. |
| `/api/hrm/leaves` | POST | Crear solicitud de leave. |
| `/api/hrm/leaves/:id/approve` | POST | Aprobar leave request. |
| `/api/hrm/leaves/:id/reject` | POST | Rechazar leave request. |
| `/api/hrm/payrolls?yachtId=&period=` | GET | Listar payroll por periodo. |
| `/api/hrm/payrolls/generate` | POST | Generar payroll del periodo. |
| `/api/hrm/payrolls/:id` | GET | Detalle de payroll individual. |
| `/api/hrm/payrolls/:id/publish` | POST | Publicar payroll para consulta del crew. |

#### Payload minimo sugerido

`POST /api/hrm/leaves`
```json
{
  "yachtId": "uuid",
  "userId": "uuid",
  "type": "Vacation",
  "startDate": "2026-04-01",
  "endDate": "2026-04-10",
  "comment": "Family leave"
}
```

`POST /api/hrm/payrolls/generate`
```json
{
  "yachtId": "uuid",
  "period": "2026-03",
  "currency": "USD"
}
```

### 7.5 Roles recomendados por accion (Fase 1)

| Accion | Crew Member | Chief Engineer | Captain | HoD | Admin/Management | SystemAdmin |
|---|---|---|---|---|---|---|
| Ver maintenance/documents/hrm de su yate | Si | Si | Si | Si | Si | Si |
| Crear maintenance task | No | Si | Si | No | Si | Si |
| Aprobar/rechazar maintenance task | No | Si | Si | No | Si | Si |
| Completar maintenance task | Si (si asignado) | Si | Si | No | Si | Si |
| Crear/editar documento | No | Si | Si | No | Si | Si |
| Iniciar/cerrar renovacion documental | No | Si | Si | No | Si | Si |
| Crear leave request | Si | Si | Si | Si | Si | Si |
| Aprobar/rechazar leave request | No | No | Si | Si | Si | Si |
| Generar/publicar payroll | No | No | Si | No | Si | Si |

### 7.6 Integracion obligatoria con Timeline y Notifications

1. Maintenance:
   - `dueDate` en ventana crea item en `/api/timeline/:yachtId`.
   - `overdue` crea alerta critica y notificacion in-app.
2. Documents:
   - vencimiento a `30/15/7` dias crea alertas escaladas.
   - renovacion completada dispara notificacion informativa.
3. HRM:
   - leave request `pending approval` crea tarea para aprobador.
   - rest-hours fuera de regla crea alerta de cumplimiento.

### 7.7 Orden de implementacion sin romper produccion

1. Fase A (read-only + status coexistente):
   - Implementar `GET` de listados y resumenes.
   - Mantener `/status` actuales.
2. Fase B (mutaciones base):
   - Crear/editar tareas maintenance.
   - Crear/editar documentos + evidencias.
   - Crear leave requests y aprobacion.
3. Fase C (workflow y eventos):
   - Estados submit/approve/reject/complete.
   - Integracion timeline + notifications + audit.
4. Fase D (payroll y compliance):
   - Generate/publish payroll.
   - Rest-hours report completo.

### 7.8 Criterios de aceptacion (Definition of Done)

1. Cada endpoint nuevo tiene validacion DTO y pruebas de rol/scope.
2. Cada mutacion escribe `AuditEvent`.
3. Dashboard de yate muestra KPIs reales de maintenance/documents/hrm.
4. SysAdmin puede ver consolidado de flota sin saltar de yate manualmente.
5. No se rompe ningun endpoint existente usado hoy por frontend.
