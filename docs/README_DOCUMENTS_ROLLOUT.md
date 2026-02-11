# Documents DMS Rollout

## Objetivo
Dejar `/documents` como modulo DMS operativo y alineado con el flujo de la plataforma:
- workflow (`draft -> submitted -> approved/rejected -> archived`)
- versionado de archivos
- auditoria con `AuditEvent`
- notificaciones in-app
- integracion con dashboard, actividad reciente y agenda/timeline

## Endpoints principales

### Uploads
- `POST /api/uploads` (`multipart/form-data`, campo `file`)
- `GET /api/uploads/:fileKey/url`
- `GET /api/uploads/files/:fileKey`

### Por yate
- `GET /api/yachts/:yachtId/documents`
- `POST /api/yachts/:yachtId/documents`

### Operaciones de documento
- `GET /api/documents?yachtId=...`
- `GET /api/documents/:id`
- `PATCH /api/documents/:id`
- `POST /api/documents/:id/versions`
- `POST /api/documents/:id/submit`
- `POST /api/documents/:id/approve`
- `POST /api/documents/:id/reject`
- `POST /api/documents/:id/archive`
- `DELETE /api/documents/:id`

### Evidencias y renovaciones (compatibilidad)
- `POST /api/documents/:id/evidences`
- `POST /api/documents/:id/renewals`
- `PATCH /api/documents/:id/renewals/:renewalId`
- `GET /api/documents/summary/:yachtId`
- `GET /api/documents/expiring/:yachtId?days=30`

## Roles y permisos
- `Captain`, `Admin`, `SystemAdmin`: aprobar/rechazar/archivar.
- `Admin`, `SystemAdmin`: eliminar.
- `Chief Engineer`, `Captain`, `Management/Office`, `Admin`, `SystemAdmin`: crear/editar/subir version.
- `Crew Member`: lectura + evidencias/versiones segun endpoint.

## Reglas de workflow y bloqueo
- Documento aprobado queda bloqueado (`lockedAt`) y no editable por roles no admin.
- Documento archivado queda fuera de edicion.
- `submit` exige al menos una version.
- `reject` y `approve` requieren motivo (reason).
- `create/version` soporta:
  - `fileKey` (nuevo flujo recomendado, upload real)
  - `fileUrl` (legacy/compatibilidad)

## Notificaciones in-app
Se emiten eventos para:
- `documents.created`
- `documents.updated`
- `documents.version_uploaded`
- `documents.submitted`
- `documents.approved`
- `documents.rejected`
- `documents.archived`
- `documents.deleted`
- `documents.expiring`
- `documents.expired`

## Dashboard / Actividad / Agenda
- `GET /api/yachts/:id/summary` ahora incluye:
  - `documentsPendingApproval`
  - `documentsExpiringSoon`
- `recentActivity` integra items `type=document` con link al modulo documentos.
- `timeline` agrega documentos por vencer/vencidos como items de agenda.

## Flags
No se agregaron flags nuevos para documentos en esta fase.
Se mantienen los flags de Logbook V2 existentes sin cambios.

## Storage por entorno

### Variables API
- `STORAGE_DRIVER=local|s3`
- `STORAGE_LOCAL_DIR=storage/uploads`
- `STORAGE_MAX_FILE_MB=20`
- `STORAGE_ALLOWED_MIME_TYPES=...`
- `API_PUBLIC_BASE_URL=http://localhost:3001`

### Modo local (DEV)
- Guarda archivo en disco (`STORAGE_LOCAL_DIR`)
- `fileUrl` queda servido por API (`/api/uploads/files/:fileKey`)

### Modo S3/R2 (PROD)
- Interfaz lista en `StorageService`
- Requiere implementación/configuración concreta de credenciales y SDK

## Checklist de smoke test
1. Subir archivo por `POST /api/uploads`.
2. Crear documento por `POST /api/yachts/:yachtId/documents` usando `initialVersion.fileKey`.
3. Subir nueva version por `POST /api/documents/:id/versions` con `fileKey`.
4. Enviar a aprobacion.
5. Aprobar o rechazar con motivo.
6. Verificar:
   - `AuditEvent` creado por accion.
   - notificacion in-app creada.
   - item en actividad reciente del yate.
7. Crear documento con `expiryDate` cercana y validar:
   - contador en dashboard.
   - aparicion en timeline/agenda.
