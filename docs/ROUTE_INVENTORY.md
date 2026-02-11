# Route Inventory - Auditoría de Rutas Reales

## 1. Route Inventory Table

### 1.1 Auth Controller
| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| POST | /auth/login | Login con email/password | auth.controller.ts:9 |
| POST | /auth/refresh | Refresh token | auth.controller.ts:14 |

### 1.2 Yachts Controller
| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| POST | /yachts | Crear yacht | yachts.controller.ts:13 |
| GET | /yachts | Listar yachts visibles | yachts.controller.ts:22 |
| POST | /yachts/:id/access | Grant access a usuario | yachts.controller.ts:27 |
| GET | /yachts/:id/access | Listar accesos del yacht | yachts.controller.ts:37 |
| PATCH | /yachts/:id/access/:uid | Update access/role | yachts.controller.ts:43 |

### 1.3 Logbook Controller
| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| POST | /logbook/entries | Crear entrada | logbook.controller.ts:30 |
| GET | /logbook/entries | Listar entradas | logbook.controller.ts:37 |
| GET | /logbook/entries/:id | Obtener entrada específica | logbook.controller.ts:48 |
| PATCH | /logbook/entries/:id | Update entrada | logbook.controller.ts:54 |
| POST | /logbook/entries/:id/submit | Submit entrada | logbook.controller.ts:64 |
| POST | /logbook/entries/:id/lock | Lock entrada | logbook.controller.ts:73 |
| POST | /engines | Crear motor | logbook.controller.ts:82 |
| GET | /engines | Listar motores | logbook.controller.ts:89 |
| DELETE | /engines/:id | Eliminar motor | logbook.controller.ts:96 |

### 1.4 Users Controller
| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| GET | /users/by-email | Obtener usuario por email | users.controller.ts:10 |

### 1.5 Alerts Controller
| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| GET | /alerts/:yachtId | Listar alertas por yacht | alerts.controller.ts:8 |

### 1.6 Maintenance Controller
| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| GET | /maintenance/status | Status de mantenimiento | maintenance.controller.ts:8 |

---

## 2. Comparación: Allowed Endpoints vs Real Routes

### Allowed Endpoints (del documento)
```
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/yachts
POST   /api/yachts
GET    /api/yachts/:id/access
POST   /api/yachts/:id/access
PATCH  /api/yachts/:id/access/:uid
GET    /api/engines?yachtId=
POST   /api/engines
GET    /api/logbook/entries?yachtId=
```

### Análisis de Cobertura

| Allowed Endpoint | Route Backend | Estado |
|-----------------|--------------|--------|
| POST /api/auth/login | POST /auth/login | ✅ Coincide |
| POST /api/auth/refresh | POST /auth/refresh | ✅ Coincide |
| GET /api/yachts | GET /yachts | ✅ Coincide |
| POST /api/yachts | POST /yachts | ✅ Coincide |
| GET /api/yachts/:id/access | GET /yachts/:id/access | ✅ Coincide |
| POST /api/yachts/:id/access | POST /yachts/:id/access | ✅ Coincide |
| PATCH /api/yachts/:id/access/:uid | PATCH /yachts/:id/access/:uid | ✅ Coincide |
| GET /api/engines?yachtId= | GET /engines | ⚠️ Path coincide, query param yachtId soportado |
| POST /api/engines | POST /engines | ⚠️ Path no coincide (debería ser /engines, no /logbook/engines) |
| GET /api/logbook/entries?yachtId= | GET /logbook/entries | ✅ Coincide |

---

## 3. Contract Mismatches (RESUELTOS v2.0)

### 3.1 Engines - Mismatch de Path (CORREGIDO)

**Estado:** ✅ RESUELTO - Los endpoints han sido actualizados en la UI

| Campo | Valor |
|-------|-------|
| **Archivo UI** | [`apps/web/components/engines/add-engine-modal.tsx`](apps/web/components/engines/add-engine-modal.tsx:49) |
| **Línea** | 49 |
| **Ruta Anterior** | `/logbook/engines` |
| **Ruta Nueva** | `/engines` |
| **Estado** | ✅ Corregido |

| Campo | Valor |
|-------|-------|
| **Archivo UI** | [`apps/web/app/(protected)/yachts/[id]/engines/page.tsx`](apps/web/app/(protected)/yachts/[id]/engines/page.tsx:88) |
| **Líneas** | 88, 161 |
| **Ruta Anterior DELETE** | `/logbook/engines/:id` |
| **Ruta Nueva DELETE** | `/engines/:id` |
| **Ruta Anterior GET** | `/logbook/engines?yachtId=` |
| **Ruta Nueva GET** | `/engines?yachtId=` |
| **Estado** | ✅ Corregido |

### 3.2 Resumen de Mismatches

| # | Problema | Archivo UI | Solución | Estado |
|---|-----------|------------|----------|--------|
| 1 | POST `/logbook/engines` → `/engines` | add-engine-modal.tsx:49 | Endpoint cambiado | ✅ Resuelto |
| 2 | DELETE `/logbook/engines/:id` → `/engines/:id` | engines/page.tsx:88 | Endpoint cambiado | ✅ Resuelto |
| 3 | GET `/logbook/engines?yachtId=` → `/engines?yachtId=` | engines/page.tsx:161 | Endpoint cambiado | ✅ Resuelto |
| 4 | GET `/engines?yachtId=` usa path correcto | logbook/page.tsx:91 | OK | ✅ OK |

---

## 4. Rutas Adicionales en Backend (No en Allowed)

| Método | Path | Descripción | Archivo |
|--------|------|-------------|---------|
| GET | /users/by-email | Obtener usuario por email | users.controller.ts |
| GET | /alerts/:yachtId | Listar alertas | alerts.controller.ts |
| GET | /maintenance/status | Status mantenimiento | maintenance.controller.ts |
| GET | /logbook/entries/:id | Obtener entrada específica | logbook.controller.ts |
| PATCH | /logbook/entries/:id | Update entrada | logbook.controller.ts |
| POST | /logbook/entries/:id/submit | Submit entrada | logbook.controller.ts |
| POST | /logbook/entries/:id/lock | Lock entrada | logbook.controller.ts |
| DELETE | /engines/:id | Eliminar motor | logbook.controller.ts |

---

## 5. Recomendaciones

### 5.1 Contract Mismatches (✅ RESUELTOS v2.0)

Los siguientes cambios fueron implementados:

1. **Endpoints de engines corregidos en la UI:**
   - De: `/logbook/engines`
   - A: `/engines`

2. **Archivos modificados:**
   - [`apps/web/components/engines/add-engine-modal.tsx`](apps/web/components/engines/add-engine-modal.tsx:49) - POST `/engines`
   - [`apps/web/app/(protected)/yachts/[id]/engines/page.tsx`](apps/web/app/(protected)/yachts/[id]/engines/page.tsx:88) - DELETE `/engines/:id`
   - [`apps/web/app/(protected)/yachts/[id]/engines/page.tsx`](apps/web/app/(protected)/yachts/[id]/engines/page.tsx:161) - GET `/engines?yachtId=`

3. **El backend acepta el path `/engines`:**
   - El controller tiene `@Controller()` sin prefijo (línea 25 de logbook.controller.ts)
   - Las rutas son: `/engines`, `/engines/:id`
   - Esto coincide con el Allowed endpoint v2.0

### 5.2 Para Features No Cubiertos (Media Prioridad)

Las siguientes rutas del backend no tienen endpoint Allowed definido:
- `/users/by-email`
- `/alerts/:yachtId`
- `/maintenance/status`
- `/logbook/entries/:id` (GET)
- `/logbook/entries/:id` (PATCH)
- `/logbook/entries/:id/submit`
- `/logbook/entries/:id/lock`
- `/engines/:id` (DELETE)

**Acción requerida:** Decidir si se agregan al Allowed endpoints o se remueve la funcionalidad de la UI.
