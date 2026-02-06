# RBAC MVP

Roles fijos:
- Chief Engineer
- Captain
- HoD
- Crew Member
- Management/Office
- Admin

## Matriz simple
- Chief Engineer: captura LogBook, ejecuta PMS, crea requisiciones técnicas.
- Captain: aprobación requisiciones nivel 2, firma ISM, valida manifiesto.
- HoD: aprobación requisiciones nivel 1, valida working days de su depto.
- Crew Member: ejecuta tareas asignadas y carga working day.
- Management/Office: aprobación requisiciones nivel 3, emisión PO simple, control documental.
- Admin: gestión de usuarios/roles/catálogos.

## Guards base
- `JwtAuthGuard`
- `RolesGuard` con `@Roles(...)`
- `YachtScopeGuard` con `@YachtScope()`
