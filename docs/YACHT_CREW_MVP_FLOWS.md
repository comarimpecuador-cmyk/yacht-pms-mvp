# Flujos de Gestión de Yachts y Crew - MVP (v2.0)

## Contrato de Arquitectura (Contexto Fijo)

**NO DISCUTIR - Estos son los hechos del sistema**

| Componente | Comportamiento |
|------------|----------------|
| **SystemAdmin** | Bypass completo (auth + scope + roles) - solo para soporte |
| **Admin** | Requiere `UserYachtAccess` para ver datos - NO bypass |
| **Captain/Crew/Others** | Requiere `UserYachtAccess` + rol válido |
| **JWT Claims** | `{ sub: userId, role: globalRole, yachtIds: [id1, id2...] }` |
| **Rol Efectivo** | `roleNameOverride ?? globalRole` |
| **yachtId** | Obligatorio en endpoints scoped - 400 si falta |

---

## Flujo 0: Selección de Yacht (Contexto)

### Actor
**Cualquier usuario autenticado con acceso a múltiples yachts**

### Pantalla de Contexto (Después del Login)

```
┌─────────────────────────────────────────────────────────────┐
│  PMS Yacht Platform                    [Juan Pérez ▼]       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Seleccione el Yacht con el que desea trabajar:             │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🚤 Eclipse                        [Seleccionar]     │    │
│  │     Captain: Juan Pérez                              │    │
│  │     Estado: Activo                                    │    │
│  │     Flag: Panamá                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🚤 Aurora                          [Seleccionar]     │    │
│  │     Captain: María García                            │    │
│  │     Estado: Activo                                    │    │
│  │     Flag: Islas Marshall                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [+] Agregar Yacht (solo Admin)                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Decisiones del Usuario
- **Seleccionar yacht**: Define el contexto para todas las operaciones subsiguientes
- **Mantener selección**: El sistema recuerda el último yacht seleccionado

### Comportamiento del Sistema
1. El sistema obtiene `yachtIds` del JWT
2. Consulta detalles de cada yacht
3. Muestra selector con nombre, estado y flag
4. Al seleccionar, almacena en sesión/localStorage
5. Todas las llamadas API incluyen `yachtId` header/query

### Casos Borde
- **Un solo yacht**: Redirige directamente al dashboard de ese yacht
- **Sin yachts**: Muestra pantalla "Sin acceso a yachts" → Contactar Admin
- **Yacht inactivo**: Muestra advertencia pero permite selección

---

## 1. Flujo: Crear un Yacht

### Actor Principal
**Admin** (con `UserYachtAccess` a algún yacht de la empresa)

### Backend Contract

| Elemento | Detalle |
|----------|---------|
| **Endpoint** | `POST /yachts` |
| **Protección** | `JwtAuthGuard + RolesGuard` |
| **Roles permitidos** | `Admin`, `Management/Office` |
| **yachtId requerido** | NO (es creación) |

### Pasos del Flujo

```
1. Navega a "Yachts" en menú lateral
2. Hace clic en [Agregar Yacht]
3. Completa formulario:
   ┌─────────────────────────────────────────┐
   │  Registrar Nuevo Yacht                    │
   ├─────────────────────────────────────────┤
   │  Nombre: [Eclipse           ] (req)      │
   │  Bandera: [Panamá ▼]                    │
   │  IMO: [IMO-1234567     ] (opcional)     │
   │  Puerto: [Colón           ] (opcional)  │
   │  Año: [2020           ] (opcional)      │
   │  [Cancelar]  [Crear Yacht]              │
   └─────────────────────────────────────────┘
4. Sistema valida nombre único en empresa
5. Sistema crea yacht (estado: Activo)
6. Sistema muestra toast: "Yacht creado exitosamente"
7. Yacht aparece en lista
```

### Reglas de Negocio

| # | Regla | Tipo | Enforced By |
|---|-------|------|-------------|
| 1.1 | Nombre obligatorio | Backend | ✅ |
| 1.2 | Nombre único por empresa | Backend | ✅ |
| 1.3 | Bandera requerida | Backend | ✅ |
| 1.4 | IMO formato válido | UI-only | ❌ |

### Errores Funcionales

| Error | Causa | Acción Usuario |
|-------|-------|---------------|
| "Nombre ya existe" | Otro yacht tiene ese nombre | Cambiar nombre |
| "No tiene permisos" | No es Admin/Management | Contactar IT |

---

## 2. Flujo: Asignar Usuario a un Yacht

### Actor Principal
**Admin** (con `UserYachtAccess` al yacht objetivo)

### Backend Contract

| Elemento | Detalle |
|----------|---------|
| **Endpoint** | `POST /yachts/:yachtId/access` |
| **Protección** | `JwtAuthGuard + RolesGuard` |
| **Roles permitidos** | `Admin`, `Management/Office` |
| **yachtId** | En URL, requiere acceso |

### Pantalla

```
1. Navega a Yachts → selecciona "Eclipse"
2. Hace clic en [Crew]
3. Ve lista de usuarios asignados
4. Hace clic en [Agregar Usuario]
5. Ingresa datos:
   ┌─────────────────────────────────────────┐
   │  Asignar Usuario al Yacht                  │
   ├─────────────────────────────────────────┤
   │  Email: [juan@email.com     ] (req)       │
   │  Rol efectivo: [Captain ▼]                │
   │  [Cancelar]  [Asignar]                  │
   └─────────────────────────────────────────┘
6. Sistema verifica email existe
7. Sistema crea UserYachtAccess
8. Usuario podrá ver el yacht en su selector
```

### Reglas de Negocio

| # | Regla | Tipo | Enforced By |
|---|-------|------|-------------|
| 2.1 | Email debe existir en plataforma | Backend | ✅ |
| 2.2 | Usuario no debe estar ya asignado | Backend | ✅ |
| 2.3 | Asignador debe tener acceso al yacht | Backend | ✅ |
| 2.4 | Rol debe ser válido | UI-only | ❌ |

### Errores Funcionales

| Error | Causa | Acción |
|-------|-------|--------|
| "Usuario no existe" | Email no registrado | Invitar usuario primero |
| "Ya está asignado" | UserYachtAccess existe | Ir a editar |

---

## 3. Flujo: Definir/Modificar Rol por Yacht

### Actor Principal
**Admin** (con `UserYachtAccess` al yacht objetivo)

### Backend Contract

| Elemento | Detalle |
|----------|---------|
| **Endpoint** | `PATCH /yachts/:yachtId/access/:userId` |
| **Protección** | `JwtAuthGuard + RolesGuard` |
| **Roles permitidos** | `Admin`, `Management/Office` |
| **yachtId** | En URL, requiere acceso |

### Pantalla

```
1. Navega a Yachts → Eclipse → Crew
2. Lista muestra usuarios con roles actuales
3. Hace clic en [Editar] junto al usuario
4. Modifica rol:
   ┌─────────────────────────────────────────┐
   │  Editar Rol de Usuario                   │
   ├─────────────────────────────────────────┤
   │  Usuario: Juan Pérez (juan@email.com)    │
   │  Rol efectivo: [Captain ▼]                │
   │  [Cancelar]  [Guardar]                  │
   └─────────────────────────────────────────┘
5. Sistema actualiza roleNameOverride
6. Cambio aplica en próximo login del usuario
```

### ⚠️ Regla Crítica de Seguridad

| # | Regla | Tipo | Enforced By |
|---|-------|------|-------------|
| 3.1 | Cambio de rol aplica en **próximo login** | Backend | ✅ |
| 3.2 | Sesión activa mantiene rol anterior | Backend | ✅ |

### Decisiones del Usuario
- **Último Captain**: El sistema advierte antes de degradar
- **Admin a Crew**: Puede romper operaciones - advertir

### Errores Funcionales

| Error | Causa | Acción |
|-------|-------|--------|
| "Es el último Captain" | Advertencia, no bloquea | Confirmar cambio |

---

## 4. Flujo: Listar Crew de un Yacht

### Backend Contract

| Elemento | Detalle |
|----------|---------|
| **Endpoint** | `GET /yachts/:yachtId/access` |
| **Protección** | `JwtAuthGuard + RolesGuard + YachtScopeGuard` |
| **yachtId** | En URL, requiere `UserYachtAccess` |

### Lo que Ve Cada Rol

```
Admin / Management / Office:
├── Lista completa con todos los usuarios
├── Puede agregar/editar/eliminar
└── Ve email y rol efectivo

Captain:
├── Lista de usuarios asignados
├── Información de contacto
└── NO puede modificar asignaciones

Crew Member:
├── Lista filtrada (rol <= Crew Member)
└── Información limitada
```

### Pantalla

```
┌─────────────────────────────────────────────────────────────┐
│  Crew del Yacht "Eclipse"                     [Eclipse ▼]   │
├─────────────────────────────────────────────────────────────┤
│  [Todos ▼] Filtrar por rol                              │
│                                                             │
│  Juan Pérez     | Captain      | juan@email.com  | [✏️]   │
│  ─────────────────────────────────────────────────────────  │
│  María García   | Chief Eng    | maria@email.com | [✏️]   │
│  ─────────────────────────────────────────────────────────  │
│  Carlos Ruiz    | Crew Member  | carlos@email.co | [✏️]   │
│                                                             │
│  [+ Agregar Usuario]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Acciones por Rol (Contrace Base)

### Matriz de Permisos MVP

| Acción | Admin | Captain | Crew | Chief Eng | Management |
|--------|-------|---------|------|-----------|------------|
| Ver dashboard | Todos | Propio | Propio | Propio | Todos |
| Crear yacht | ✅ | ❌ | ❌ | ❌ | ✅ |
| Asignar crew | ✅ | ❌ | ❌ | ❌ | ✅ |
| Modificar rol | ✅ | ❌ | ❌ | ❌ | ✅ |
| Crear logbook | ❌ | ✅ | ✅ | ✅ | ❌ |
| Lock logbook | ❌ | ✅ | ❌ | ✅ | ❌ |
| Ver engines | Si tiene acceso | ✅ | ✅ | ✅ | Si tiene acceso |
| CRUD engines | ❌ | ✅ | ❌ | ✅ | ❌ |
| Ver reportes | Todos | Propio | ❌ | Propio | Todos |

### Nota Importante

**Admin NO tiene acceso automático a los datos de los yachts.**

- Admin ve la lista de yachts
- Admin puede asignar usuarios
- Admin NO puede ver logbooks, engines, etc. **a menos que también tenga `UserYachtAccess`**

---

## 6. Reglas de Negocio (Consolidado)

### 🔒 Reglas Enforced por Backend

| # | Regla | Archivo |
|---|-------|---------|
| RB1 | SystemAdmin bypass completo | `YachtScopeGuard.ts`, `RolesGuard.ts` |
| RB2 | Admin requiere UserYachtAccess | `YachtScopeGuard.ts` |
| RB3 | yachtId obligatorio → 400 | `YachtScopeGuard.ts:25` |
| RB4 | Sin UserYachtAccess → 403 | `YachtScopeGuard.ts:44` |
| RB5 | Rol efectivo = override ?? global | `RolesGuard.ts:44` |
| RB6 | Cambio de rol → próximo login | `YachtService.ts` |
| RB7 | Refresh token inválido → 401 | `AuthService.ts:69` |

### 🎨 Reglas UI-Only

| # | Regla |
|---|-------|
| UI1 | Advertir si nombre de yacht ya existe (antes de submit) |
| UI2 | Advertir si es el último Captain |
| UI3 | Filtrar dropdown de roles según contexto |
| UI4 | Validar formato email en cliente |
| UI5 | Mostrar loading durante llamadas API |

### 📋 Reglas de Negocio Puro

| # | Regla |
|---|-------|
| NB1 | Un usuario puede pertenecer a múltiples yachts |
| NB2 | Un usuario puede tener diferente rol en cada yacht |
| NB3 | Yacht inactivo no permite nuevas operaciones |
| NB4 | El último Admin no puede removerse de la plataforma |
| NB5 | Un yacht debe tener al menos un Captain activo |

---

## 7. Endpoints: Público vs Protegido

### 🌐 Endpoints Públicos (Sin Auth)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `*/status` | GET | Status de módulos |

### 🔐 Endpoints Protegidos (Requiere Auth)

| Endpoint | Método | Roles | yachtId |
|----------|--------|-------|---------|
| `/yachts` | GET | Todos | ❌ |
| `/yachts` | POST | Admin, Management | ❌ |
| `/yachts/:id/access` | GET | Admin, Management | ✅ |
| `/yachts/:id/access` | POST | Admin, Management | ✅ |
| `/yachts/:id/access/:uid` | PATCH | Admin, Management | ✅ |
| `/engines` | GET | Captain, Crew, Chief, Admin* | ✅ |
| `/engines` | POST | Captain, Chief, Admin* | ✅ |
| `/logbook/entries` | GET | Captain, Crew, Chief, Admin* | ✅ |
| `/logbook/entries` | POST | Captain, Crew, Chief | ✅ |
| `/logbook/entries/:id` | GET | Captain, Crew, Chief, Admin* | ✅ |

*Admin requiere `UserYachtAccess`

### Códigos de Error Estándar

| Código | Significado | Ejemplo |
|--------|-------------|---------|
| 401 | No autenticado | Sin token |
| 403 | No autorizado | Sin UserYachtAccess |
| 400 | Bad Request | Falta yachtId |
| 404 | No existe | Yacht o usuario no encontrado |

---

## 8. Casos Especiales Documentados

### Usuario Multi-Yacht

```
Juan: Captain en Eclipse, Crew en Aurora

Login → JWT: { yachtIds: ["eclipse-id", "aurora-id"] }

Dashboard muestra selector con ambos yachts:
- Selecciona Eclipse → permisos de Captain
- Selecciona Aurora → permisos de Crew

El sistema usa el yachtId de la selección actual
```

### Cambio de Rol Durante Sesión

```
Juan (Captain) está creando logbook entry.
Admin le cambia rol a Crew Member.

Durante la sesión actual:
- Juan sigue siendo Captain
- El entry se guarda con su rol actual

Próximo login:
- Juan será Crew Member
- No puede crear nuevas entries
```

### Usuario Sin Yachts

```
María fue removida de todos los yachts.

Login → Dashboard muestra:
┌─────────────────────────────────┐
│  Sin Acceso a Yachts             │
│                                  │
│  No tiene ningún yacht asignado. │
│  Contacte al Administrator.      │
└─────────────────────────────────┘

No puede acceder a ninguna operación.
```

---

## 9. Pantallas MVP Requeridas

| Pantalla | Ruta | Roles |
|----------|------|-------|
| Login | `/login` | Público |
| Selector Yacht | `/dashboard` | Authenticated |
| Lista Yachts | `/yachts` | Admin, Management |
| Detalle Yacht | `/yachts/:id` | Admin, Management |
| Crew | `/yachts/:id/crew` | Admin, Management, Captain |
| Dashboard Yacht | `/yachts/:id/home` | Todos con acceso |
| Engines | `/engines` | Captain, Chief, Crew* |
| Logbook | `/logbook` | Captain, Chief, Crew |

---

## 10. Checklist de Consistencia

```
✅ SystemAdmin bypass explícito y único
✅ Admin NO bypassa scope
✅ yachtId obligatorio en endpoints scoped
✅ Códigos de error consistentes
✅ Rol efectivo sobreescribe global
✅ Sesión activa no afecta cambio de rol
✅ Endpoints públicos limitados a health/status
✅ Matriz de permisos clara y documentada
```

---

## Próximos Pasos

1. **Diseñador UI**: Usar este documento para mockups
2. **Frontend**: Implementar flujos según pantalla
3. **Backend**: APIs ya están implementadas (verificar contratos)
4. **QA**: Usar `qa-smoke.ps1` para validación
