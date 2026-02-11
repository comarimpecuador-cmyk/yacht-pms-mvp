# Notificaciones + Timeline (MVP)

## Tipos de eventos
- `documents.expiring` / `documents.expired`
- `maintenance.due` / `maintenance.overdue`
- `ism.pending_signature`
- `requisitions.pending_approval`

## Regla engine (scheduler horario)
Se ejecuta cada hora con BullMQ/cron (`0 * * * *`) y evalúa:
1. Documentos por vencer: 30/14/7/3/1 días y vencidos.
2. Maintenance Due/Overdue.
3. ISM pendientes de firma.
4. Requisiciones pendientes por nivel HoD/Captain/Management.

Cada hallazgo:
- upsert de `Alert` usando `dedupeKey`
- notificación `in_app`
- notificación `email` para severidad `critical` o según preferencia

## Reglas de envío y anti-spam
- Nunca enviar el mismo email más de una vez por día por `dedupeKey`.
- Re-notificar si cambia severidad o sigue no resuelto.
- Canales soportados: `in_app`, `email`, `push_future` (mock en MVP).

## Configuración por usuario
`NotificationPreference` permite:
- canales (`inAppEnabled`, `emailEnabled`, `pushFuture`)
- ventana horaria (`windowStart`, `windowEnd`)
- timezone
- severidad mínima
- yachts scope

## Prueba local sin emails reales
1. En `apps/api/.env`, usar:
   - `EMAIL_ENABLED=false`
   - `EMAIL_PROVIDER=mock`
2. Levantar Redis y API.
3. Invocar endpoint de scheduler/job dummy o esperar cron horario.
4. Consultar:
   - `GET /api/alerts/:yachtId`
   - `GET /api/notifications/in-app/:userId`
   - `GET /api/timeline/:yachtId?windowDays=14`
