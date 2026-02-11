# Auditoría transversal (AuditEvent)

## Campos
- `module`
- `entityType`
- `entityId`
- `action`
- `actorId`
- `timestamp`
- `beforeJson`
- `afterJson`
- `source`
- `ipDevice`

## Cuándo se escribe
Interceptor `AuditInterceptor` registra automáticamente acciones críticas HTTP:
- `POST`
- `PUT`
- `PATCH`
- `DELETE`

## Nota
En este scaffold se registra estructura base para trazabilidad. La afinación por módulo se implementa en siguientes iteraciones.
