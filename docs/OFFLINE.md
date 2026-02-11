# Plan Offline (Mobile)

## Estado actual
- SQLite inicializado.
- Tabla `pending_ops` creada para almacenar operaciones offline pendientes.

## Tabla
- `id`
- `module`
- `payload`
- `created_at`
- `status`

## Estrategia futura de sync
1. Guardar eventos localmente.
2. Reintentar envío cuando haya conectividad.
3. Resolver conflictos por versión de entidad.
4. Marcar éxito/error y mantener bitácora de sync.
