# MVP Operación Diaria (Privado) – Yacht PMS

## A) Mapa de módulos y relación entre ellos

```text
[Log Book Diario]
   ├─ actualiza contadores de motor (horas)
   ├─ registra observaciones técnicas
   └─ dispara reglas de mantenimiento (por horas/fecha)
                    │
                    ▼
           [PMS Mantenimiento]
   ├─ planificado por hora motor
   ├─ planificado por calendario
   ├─ ejecución de trabajo + evidencias
   └─ si falta repuesto/servicio → crear requisición
                    │
                    ▼
          [Requisiciones / PO simple]
   ├─ solicitud interna (repuesto/servicio)
   ├─ aprobación HoD → Captain → Management
   └─ emisión de PO simple (sin contabilidad)

[Documentos y Vencimientos]
   ├─ docs de yate
   ├─ docs de tripulación
   ├─ alertas por vencimiento
   └─ evidencia de renovación

[ISM / SMS]
   ├─ procedimientos versionados
   ├─ registros/formularios operativos
   ├─ reportes de incidentes/no conformidades
   ├─ firmas
   └─ historial auditable

[Guest Manifest]
   ├─ lista de pasajeros por viaje
   ├─ exportación PDF/Excel
   └─ histórico por yate/viaje

[Working Days Crew]
   ├─ schedule diario
   ├─ trabajado/descanso/leave
   └─ reporte mensual simple
```

**Relaciones clave (mínimas y operativas):**
- Log Book alimenta PMS con horas reales de motor.
- PMS puede abrir Requisición cuando no hay stock o se requiere servicio externo.
- Requisición aprobada genera PO simple y queda enlazada al mantenimiento origen.
- Documentos generan alertas y tarea de renovación con evidencia.
- ISM guarda registros firmados y versiona procedimientos para auditoría.
- Manifiesto se asocia a viaje y yate; queda histórico exportable.
- Working Days consolida datos diarios en reporte mensual por tripulante.

---

## B) Mapa de pantallas (web + móvil) con navegación

## Web (Captain / HoD / Management / Office)

1. **Login**
2. **Inicio (bandeja operativa, no dashboard analítico)**
   - Tareas pendientes de aprobación
   - Alertas de vencimientos de documentos
   - Mantenimientos vencidos/próximos
   - Formularios ISM pendientes de firma
3. **PMS**
   - Plan de mantenimiento (lista)
   - Órdenes de trabajo
   - Historial
4. **Log Book**
   - Registro diario por yate
   - Vista por fecha
5. **Requisiciones**
   - Nueva requisición
   - Cola de aprobaciones
   - PO simple emitidas
6. **Documentos**
   - Documentos yate
   - Documentos tripulación
   - Renovaciones y evidencias
7. **ISM / SMS**
   - Procedimientos (versiones)
   - Registros
   - Reportes
   - Contactos
   - Firmas pendientes
8. **Guest Manifest**
   - Viajes
   - Manifiestos
   - Exportar PDF/Excel
9. **Working Days**
   - Carga diaria
   - Cierre mensual
   - Reporte por tripulante
10. **Auditoría**
    - Bitácora por módulo/entidad/usuario/fecha
11. **Administración**
    - Usuarios
    - Roles
    - Catálogos mínimos (yates, áreas, motores)

## Móvil (Chief Engineer / Crew / Captain on-the-go)

1. **Inicio móvil (mis pendientes)**
2. **Log Book rápido**
   - Captura contadores y observaciones
3. **Tareas PMS del día**
   - Ejecutar/cerrar tarea
   - Adjuntar foto/evidencia
4. **Requisición rápida**
   - Crear desde mantenimiento
   - Ver estado
5. **Documentos alertas**
   - Vencimientos cercanos
   - Subir evidencia de renovación
6. **ISM Forms**
   - Completar formulario
   - Firmar
7. **Working Days**
   - Marcar trabajado/descanso/leave
8. **Guest list (lectura + validación)**

**Navegación principal:** Inicio → Módulo → Registro/Acción → Confirmación/Estado → Auditoría automática.

---

## C) Flujos paso a paso por rol (uso real en un día)

## 1) Chief Engineer
**Qué ve al entrar:**
- Mantenimientos del día (por horas/fecha).
- Alertas por mantenimientos vencidos.
- Último Log Book con contadores de motor.

**Qué acciones hace:**
1. Abre **Log Book** y carga horas reales de motores/generadores + observaciones.
2. Sistema recalcula vencimientos PMS por horas.
3. Ejecuta tareas PMS programadas.
4. Si detecta faltante, crea **Requisición** desde la tarea PMS (autovinculada).
5. Cierra tarea con evidencia (foto, checklist, comentario).

**Qué aprueba:**
- No aprueba flujo financiero; valida técnicamente ejecución de mantenimiento (check técnico).

**Qué notificaciones recibe:**
- “Mantenimiento vencido”.
- “Requisición rechazada/observada para corrección técnica”.
- “PO emitida – repuesto en gestión”.

## 2) Captain
**Qué ve al entrar:**
- Cola de aprobaciones (requisiciones, firmas ISM, manifiesto previo a salida).
- Alertas críticas de documentos (yate y crew).

**Qué acciones hace:**
1. Revisa requisiciones aprobadas por HoD.
2. Aprueba/rechaza con comentario obligatorio.
3. Firma registros ISM pendientes.
4. Valida manifiesto final del viaje.
5. Revisa cumplimiento de working schedules.

**Qué aprueba:**
- Requisición en segundo nivel.
- Firmas operativas ISM/SMS.
- Validación final de manifiesto antes de zarpe.

**Qué notificaciones recibe:**
- “Requisición esperando aprobación Captain”.
- “Documento crítico vence en X días”.
- “Formulario ISM listo para firma”.

## 3) HoD (Head of Department)
**Qué ve al entrar:**
- Solicitudes de su departamento.
- Tareas PMS asociadas a su área.
- Registros de personal del área.

**Qué acciones hace:**
1. Crea o revisa requisiciones internas.
2. Aprueba/rechaza primer nivel.
3. Da seguimiento a tareas del área y cumplimiento.
4. Supervisa carga diaria de working days.

**Qué aprueba:**
- Primer nivel de requisiciones.
- Validación operativa de formularios/registros de su área.

**Qué notificaciones recibe:**
- “Nueva requisición creada por equipo”.
- “Requisición devuelta por Captain/Management”.
- “Falta carga de working days en su área”.

## 4) Crew Member
**Qué ve al entrar:**
- Mis tareas del día (PMS/ISM/schedule).
- Mis documentos por vencer.

**Qué acciones hace:**
1. Ejecuta tareas asignadas (checklist + evidencia).
2. Completa formularios ISM requeridos.
3. Registra estado diario de trabajo (worked/rest/leave).
4. Carga renovación de documento propio cuando aplica.

**Qué aprueba:**
- No aprueba flujo de requisiciones; solo confirma ejecución y firma de su registro.

**Qué notificaciones recibe:**
- “Tarea asignada hoy”.
- “Tu licencia/certificado vence en X días”.
- “Formulario pendiente de completar”.

## 5) Oficina / Management
**Qué ve al entrar:**
- Aprobaciones finales de requisiciones.
- PO simples pendientes de emisión.
- Vencimientos de documentos consolidados.
- Bitácora de auditoría interna.

**Qué acciones hace:**
1. Aprueba/rechaza requisición final.
2. Emite **PO simple** (proveedor, ítems, plazo estimado).
3. Controla renovación documental y evidencia.
4. Revisa trazabilidad ISM y auditoría.
5. Genera exportables (manifiestos y reportes mensuales de crew days).

**Qué aprueba:**
- Tercer nivel de requisiciones (final).
- Emisión PO simple.

**Qué notificaciones recibe:**
- “Requisición lista para aprobación final”.
- “Documento vencido sin evidencia de renovación”.
- “Mes listo para cierre de working days”.

---

## D) Estados de cada entidad

## Maintenance
- `Draft` (plantilla/tarea creada)
- `Scheduled`
- `Due` (vencida o por vencer según regla)
- `In Progress`
- `Blocked` (espera repuesto/servicio)
- `Completed`
- `Verified` (validación técnica)
- `Archived`

## Log Book
- `Draft`
- `Submitted`
- `Locked` (cerrado por fecha/guardia)
- `Corrected` (con trazabilidad)

## Requisitions
- `Draft`
- `Submitted`
- `Under HoD Review`
- `Under Captain Review`
- `Under Management Review`
- `Approved`
- `Rejected`
- `PO Issued`
- `Partially Fulfilled`
- `Closed`

## Documents
- `Active`
- `Expiring Soon`
- `Expired`
- `Renewal In Progress`
- `Renewed`
- `Archived`

## ISM records
- `Draft`
- `Submitted`
- `Under Review`
- `Pending Signature`
- `Signed`
- `Version Superseded` (para procedimientos)
- `Archived`

## Guest manifest
- `Draft`
- `In Review`
- `Captain Approved`
- `Final`
- `Exported`
- `Archived`

## Working days
- `Draft Daily`
- `Submitted Daily`
- `Validated by HoD`
- `Monthly Closed`
- `Exported`

---

## E) Modelo de datos (entidades + relaciones)

## Núcleo organizacional
- `Yacht(id, name, flag, imo_optional)`
- `Department(id, yacht_id, name)`
- `User(id, name, role_id, active)`
- `CrewProfile(user_id, rank, department_id, sign_on, sign_off)`
- `Role(id, name)`

## PMS / Log Book
- `Engine(id, yacht_id, type, serial_no)`
- `EngineCounter(id, engine_id, reading_hours, reading_date, source_logbook_id)`
- `MaintenancePlan(id, yacht_id, asset_type, asset_id, trigger_type[hours|date], interval_hours, interval_days)`
- `MaintenanceTask(id, plan_id, due_at, due_hours, status, assigned_to)`
- `MaintenanceWorkLog(id, task_id, performed_by, started_at, ended_at, notes)`
- `MaintenanceEvidence(id, work_log_id, file_url, uploaded_by)`
- `LogBookEntry(id, yacht_id, entry_date, watch_period, status, created_by)`
- `LogBookEngineReading(id, logbook_id, engine_id, hours)`
- `LogBookObservation(id, logbook_id, category, text)`

**Relaciones:**
- `LogBookEngineReading` actualiza `EngineCounter`.
- `EngineCounter` + `MaintenancePlan` generan/actualizan `MaintenanceTask`.

## Requisiciones / PO
- `Requisition(id, yacht_id, requested_by, department_id, source_task_id, status, justification)`
- `RequisitionItem(id, requisition_id, description, qty, unit)`
- `ApprovalStep(id, requisition_id, level[HoD|Captain|Management], approver_id, decision, decided_at, comment)`
- `PurchaseOrder(id, requisition_id, po_number, supplier_name, issue_date, status)`
- `POItem(id, po_id, requisition_item_id, qty_ordered)`

## Documentos
- `Document(id, owner_type[Yacht|Crew], owner_id, doc_type, number, issue_date, expiry_date, status)`
- `DocumentRenewal(id, document_id, requested_at, completed_at, status)`
- `DocumentEvidence(id, renewal_id, file_url, uploaded_by)`
- `Alert(id, module, entity_id, alert_type, trigger_at, resolved_at)`

## ISM / SMS
- `ISMProcedure(id, yacht_id, code, title, current_version_id)`
- `ISMProcedureVersion(id, procedure_id, version_no, content_ref, effective_date, status)`
- `ISMRecord(id, yacht_id, type, event_date, status, created_by)`
- `ISMReport(id, yacht_id, report_type, severity, status, created_by)`
- `ISMSignature(id, entity_type[Record|Report|ProcedureVersion], entity_id, signer_id, signed_at, signature_hash)`
- `ISMContact(id, yacht_id, contact_type, name, phone, email)`

## Guest Manifest
- `Voyage(id, yacht_id, departure_dt, arrival_dt, route_text, captain_id)`
- `GuestManifest(id, voyage_id, status, approved_by, approved_at)`
- `Guest(id, manifest_id, full_name, dob, nationality, passport_no)`
- `ManifestExport(id, manifest_id, format[pdf|xlsx], generated_by, generated_at, file_url)`

## Working Days
- `WorkingDay(id, yacht_id, crew_user_id, work_date, status[worked|rest|leave], shift_code, notes)`
- `MonthlyCrewReport(id, yacht_id, year_month, generated_at, generated_by)`
- `MonthlyCrewReportLine(id, report_id, crew_user_id, worked_days, rest_days, leave_days)`

## Auditoría transversal
- `AuditEvent(id, module, entity_type, entity_id, action, actor_id, timestamp, before_json, after_json, ip_device)`

---

## F) Roles y permisos (RBAC)

## Roles fijos MVP
- `Chief Engineer`
- `Captain`
- `HoD`
- `Crew Member`
- `Management/Office`
- `Admin` (técnico-operativo interno)

## Matriz simplificada (acción principal)

- **Chief Engineer**
  - Crear/editar Log Book técnico
  - Ejecutar/cerrar maintenance tasks
  - Crear requisición desde mantenimiento
  - Ver estado de requisiciones técnicas

- **Captain**
  - Aprobar/rechazar requisiciones nivel 2
  - Aprobar manifiesto final
  - Firmar ISM records asignados
  - Ver todo el yate (lectura operativa)

- **HoD**
  - Aprobar/rechazar requisiciones nivel 1
  - Asignar/validar tareas del área
  - Validar working days de su departamento

- **Crew Member**
  - Ejecutar tareas asignadas
  - Completar forms ISM asignados
  - Cargar working day propio
  - Ver/actualizar documentos propios

- **Management/Office**
  - Aprobar/rechazar requisiciones nivel 3
  - Emitir PO simple
  - Gestionar renovaciones documentales
  - Consultar auditoría y exportables

- **Admin**
  - Gestión de usuarios/roles/catálogos
  - Sin aprobación operativa por defecto (separación de funciones)

**Regla crítica:** todo cambio relevante escribe `AuditEvent` obligatorio e inmutable.

---

## G) Uso offline en móvil + sincronización

## Alcance offline MVP
- Captura offline permitida para:
  - Log Book (lectura contadores/observaciones)
  - Ejecución de tareas PMS con evidencia local
  - Formularios ISM asignados
  - Working day diario
- No se permite aprobación final offline (requisiciones/firmas críticas requieren online).

## Estrategia de sync (simple y robusta)
1. App guarda eventos en cola local (`pending_ops`).
2. Cada evento lleva `uuid`, `timestamp`, `actor`, `entity_version`.
3. Al reconectar, sincroniza FIFO por módulo.
4. Resolución de conflicto:
   - Si registro no cambió en servidor → aplica directo.
   - Si cambió → marca `conflict` y pide resolución manual al rol responsable (HoD/Captain/Office según módulo).
5. Evidencias (fotos/docs) suben con reintentos y checksum.

## Reglas anti-pérdida
- Nunca borrar local hasta confirmación server.
- Bitácora de sync visible al usuario (“pendiente / enviado / conflicto / fallido”).

---

## H) Auditoría (quién hizo qué, cuándo)

## Principios
- Auditoría por evento, no por resumen.
- Inmutable: no se edita ni borra `AuditEvent` desde UI.
- Trazabilidad completa en acciones críticas.

## Eventos auditables obligatorios
- Alta/edición/cierre de Log Book.
- Cambio de estado en MaintenanceTask.
- Creación/aprobación/rechazo de Requisition.
- Emisión de PO.
- Alta/renovación/vencimiento de Document.
- Publicación de versión ISM + firmas.
- Aprobación/finalización de Guest Manifest.
- Validación/cierre mensual de Working Days.

## Campos mínimos por evento
- `actor_id`
- `action`
- `module`
- `entity_type` + `entity_id`
- `timestamp` (UTC)
- `before_json` / `after_json`
- `source` (web/móvil/api)
- `ip_device`

## Vistas de auditoría en MVP
- Filtro por módulo, yate, rango fecha, usuario, entidad.
- “Timeline de entidad” (ej. una requisición completa desde draft a PO).
- Export CSV para auditoría interna.

---

## Flujo diario unificado (end-to-end)

1. **Log Book diario** (Chief Engineer/Crew) registra horas y observaciones.
2. Motor de reglas PMS recalcula próximos vencimientos por hora/fecha.
3. Se ejecuta mantenimiento del día; si falta material, se abre requisición enlazada.
4. Requisición recorre aprobación **HoD → Captain → Management**.
5. Management emite **PO simple** y se rastrea estado hasta cierre.
6. Paralelo: módulo de **Documentos** dispara alertas por vencimiento y exige evidencia al renovar.
7. Módulo **ISM/SMS** captura formularios/registros, solicita firmas y archiva versionado.
8. **Guest Manifest** se prepara por viaje, Captain valida, se exporta y queda histórico.
9. **Working Days** se carga diariamente y al final de mes se cierra reporte simple por tripulante.
10. Todo el flujo deja rastro en **AuditEvent** para auditoría interna.

Este diseño mantiene el alcance estrictamente operativo del MVP privado: ejecución diaria, aprobaciones claras, evidencia documental y trazabilidad completa, sin módulos financieros ni analítica avanzada.
