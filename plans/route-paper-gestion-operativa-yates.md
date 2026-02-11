# Route Paper: Gestion Operativa de Yates (Scope CORE + PMS + HRM + ISM base)

Fecha: 2026-02-10
Alcance explicitamente excluido: `Finance`, `Charter`, `Sync`.

## 1) Objetivo

Disenar y ejecutar una arquitectura de flujos operativos reales para:
1. `Cuaderno de bitacora` (PMS Log Book) orientado a operacion de yate.
2. `Maintenance` operativo (planificar, aprobar, ejecutar, evidenciar, cerrar).
3. `Documents` operativo (vigencia, renovacion, evidencia y cumplimiento).
4. `HRM` operativo (schedules, rest, leaves, payroll base en USD).
5. `Notifications` utiles y accionables conectadas a esos modulos.

## 2) Estado Actual (As-Is)

### 2.1 Ya implementado
1. Mantenimiento funcional (API + UX): tareas, estados, evidencias, resumen.
2. Documentos funcional (API + UX): CRUD base, renovaciones, evidencias, resumen.
3. HRM funcional base (API + UX): schedules, rest declarations/report, leaves, payroll generate/publish.
4. Moneda de payroll orientada a `USD` por defecto en backend y frontend.
5. Notificaciones in-app integradas en mutaciones de `maintenance`, `documents`, `hrm`.
6. Rule engine de scheduler sin mocks para mantenimiento (ya no genera alertas falsas de `mock-yacht`).

### 2.2 Gap principal
1. Bitacora actual es funcional, pero aun no cubre estructura nautica completa ni firma/cierre formal por guardia.
2. Faltan algunos endpoints ya existentes que todavia no se consumen en UX.
3. Falta consolidado de flota mas fuerte para SysAdmin con KPIs operativos + compliance.

## 3) APIs Pendientes de Aplicar a UX (To-Connect)

## 3.1 Ya existen en backend y faltan en frontend
1. `/api/maintenance/calendar/:yachtId?windowDays=` (agenda maintenance para vista calendario consolidada).
2. `/api/documents/expiring/:yachtId?days=` (vista dedicada de vencimientos y priorizacion documental).
3. `/api/hrm/payrolls/:id` (detalle individual de nomina por persona/linea).
4. `/api/yachts/:id` GET (detalle expandido de yate para panel tecnico/administrativo).
5. `/api/manifest/status`, `/api/working-days/status`, `/api/requisitions/status`, `/api/ism/status` (panel de readiness por modulo).

## 3.2 Endpoints existentes pero hoy de soporte
1. `/api/notifications/in-app/:userId`, `/api/notifications/settings/:userId` (compatibilidad/administracion).
2. `/api/auth/debug/cookies`, `/api/health`, `/api/queue/dummy` (infra/diagnostico).

## 4) Diseno Objetivo de Flujo Operativo (To-Be)

### 4.1 Flujo principal por usuario
1. Login.
2. Seleccion de yate.
3. Dashboard del yate (KPIs + alertas + tareas de hoy).
4. Entrada por modulo:
   - Bitacora (operacion por guardia).
   - Maintenance (trabajo tecnico).
   - Documents (compliance documental).
   - HRM (tripulacion, descanso, ausencias, payroll).

### 4.2 Flujo SysAdmin
1. Dashboard global de flota.
2. Ranking por riesgo (alertas criticas, vencimientos, tareas overdue, non-compliance HRM).
3. Drill-down a yate especifico.
4. Acciones de gobernanza (usuarios, accesos, supervision).

## 5) Bitacora Optima para Yates (Diseno Recomendado)

## 5.1 Problema del modelo actual
La bitacora actual registra lecturas de motores + observaciones, pero para operacion de yate normalmente se necesita tambien:
1. Contexto de navegacion.
2. Consumos operativos.
3. Eventos de seguridad/maniobra.
4. Firma/cierre trazable por responsables.

## 5.2 Modelo Logbook v2 (recomendado)
Agregar a `LogBookEntry` y/o tablas relacionadas:
1. `positionLat`, `positionLon`.
2. `weather`, `seaState`, `wind`.
3. `navigationMode` (at sea, at anchor, in port).
4. `fuelOnBoard`, `freshWaterOnBoard` (snapshots).
5. `incidentsCount` o `incidentRefs`.
6. `handoverNotes` entre guardias.
7. `submittedBy`, `lockedBy`, `lockedAt` (trazabilidad formal).
8. `signatureType`/`signatureRef` para cierre.

## 5.3 Flujo de bitacora recomendado
1. Crew/engineer crea `Draft`.
2. Puede editar mientras `Draft/Corrected`.
3. Envia (`Submitted`) al rol revisor.
4. Revisor:
   - `Lock` (cierre formal), o
   - `Correct` (regresa con motivo).
5. Entrada cerrada alimenta:
   - Historial tecnico.
   - Counters de motores.
   - Timeline operativo.
   - Alertas si detecta anomalias.

## 5.4 Endpoints sugeridos para completar bitacora
1. `POST /api/logbook/entries/:id/correct` (motivo de correccion).
2. `POST /api/logbook/entries/:id/sign-off` (firma/cierre formal).
3. `GET /api/logbook/entries/:id/export-pdf` (entrega operacional/auditoria).
4. `GET /api/logbook/entries?yachtId=&status=&watchPeriod=&from=&to=` (filtros avanzados).

## 6) Notificaciones Operativas (Diseno)

## 6.1 Principio
La notificacion debe pedir accion concreta, no solo informar.

## 6.2 Matriz minima de eventos
1. Maintenance:
   - task_assigned -> asignado.
   - task_submitted -> revisores.
   - task_approved/rejected/completed -> creador + asignado.
2. Documents:
   - expiring/expired -> asignado + responsable.
   - renewal_started/completed -> responsables.
   - evidence_added -> creador/asignado.
3. HRM:
   - leave_pending_approval -> aprobadores.
   - leave_approved/rejected -> solicitante.
   - rest_non_compliance -> capitan/management.
   - payroll_generated/published -> management/crew.
4. Logbook (proxima fase):
   - entry_submitted -> capitan/chief engineer.
   - entry_corrected_required -> creador.
   - entry_locked -> tripulacion relevante.

## 6.3 Severidad recomendada
1. `info`: cambios de estado normales.
2. `warn`: pendientes de aprobacion / due soon.
3. `critical`: overdue, expired, non-compliance.

## 7) Roadmap de Implementacion

## Fase 1 (completada base)
1. Maintenance/Documents/HRM funcionales.
2. UX en espanol.
3. Integracion inicial de notificaciones.

## Fase 2 (prioridad alta)
1. Bitacora v2 (modelo nautico + correccion + sign-off).
2. Conectar `maintenance/calendar` y `documents/expiring` a UX.
3. Detalle payroll (`/api/hrm/payrolls/:id`) con vista por tripulante.
4. Timeline consolidado con eventos de maintenance/documents/hrm/logbook.

## Fase 3 (gobernanza y compliance)
1. Panel SysAdmin consolidado por flota con riesgo/compliance.
2. Estado real de modulos `ISM/Requisitions/Manifest` en tablero de readiness.
3. Exportes operativos (CSV/PDF) para auditoria y reportes de capitania.

## 8) Criterios de Exito (KPIs)

1. Reduccion de tareas maintenance vencidas por yate.
2. Reduccion de documentos vencidos sin renovacion iniciada.
3. Tasa de cumplimiento rest-hours por tripulacion.
4. Tiempo medio de aprobacion (maintenance/leaves).
5. Tasa de cierre de bitacora por guardia dentro de ventana operativa.
6. Tiempo de respuesta a alertas criticas.

## 9) Riesgos y Mitigaciones

1. Riesgo: sobrecarga de notificaciones.
   - Mitigacion: dedupe + severidad + ventanas horarias por usuario.
2. Riesgo: datos incompletos en bitacora.
   - Mitigacion: validaciones por etapa (draft vs submit).
3. Riesgo: friccion UX por complejidad.
   - Mitigacion: formularios por pasos, defaults y autocompletado por yate.
4. Riesgo: adopcion baja por roles.
   - Mitigacion: tablero por rol con tareas accionables y estados claros.

## 10) Decisiones Arquitectonicas Recomendadas

1. Mantener `yacht scope` obligatorio en todo endpoint operativo.
2. Toda mutacion relevante crea `AuditEvent`.
3. Evitar logica mock en scheduler productivo.
4. Diseñar contratos API primero y UX en paralelo por modulo.
5. Usar `USD` como moneda base operacional (con opcion futura multi-currency).
