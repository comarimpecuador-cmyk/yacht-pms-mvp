# 🔒 AUDITORÍA DE SEGURIDAD - AUTH/RBAC/YACHT SCOPE

**Fecha:** 2026-02-10  
**Auditor:** Senior Security Architect  
**Sistema:** PMS Yacht Platform (Next.js + NestJS + Prisma)

---

## 🚨 HALLAZGOS CRÍTICOS P0 (Bloqueantes)

### P0-01: Bypass Inconsistente de SystemAdmin
**Archivo:** [`apps/api/src/modules/yachts/yachts.controller.ts:14`](apps/api/src/modules/yachts/yachts.controller.ts:14)

```typescript
@Post()
@Roles('Admin', 'Management/Office')  // ❌ FALTA SystemAdmin
createYacht(@Req() req, @Body() body) { ... }
```

**Problema:** SystemAdmin tiene bypass en `RolesGuard` pero NO está en la lista de roles permitidos. Aunque el bypass funciona, es una inconsistencia semántica que causará bugs si se remueve el bypass.

**Impacto:** SystemAdmin no puede crear yates por diseño explícito, pero puede por implementación del bypass.

**Fix:**
```diff
- @Roles('Admin', 'Management/Office')
+ @Roles('SystemAdmin', 'Admin', 'Management/Office')
```

---

### P0-02: SystemAdmin Perde Acceso en Refresh Token
**Archivo:** [`apps/api/src/auth/auth.service.ts:91`](apps/api/src/auth/auth.service.ts:91)

```typescript
async refresh(refreshToken: string) {
  // ...
  const yachtIds = user.yachtAccesses.map((x) => x.yachtId); // ❌ BUG
  const roleName = user.role?.name ?? payload.role ?? 'Captain';
  
  return this.signTokens({ sub: user.id, role: roleName, yachtIds });
}
```

**Problema:** En `refresh()`, NO se vuelve a calcular `yachtIds` para SystemAdmin. Para un SystemAdmin, `user.yachtAccesses` está vacío (no tiene registros en userYachtAccess), por lo que `yachtIds = []`.

**Impacto:** Después de un refresh, SystemAdmin pierde acceso a todos los yates y solo puede ver su "lista vacía".

**Fix:**
```diff
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      role: true,
      yachtAccesses: { select: { yachtId: true } },
    },
  });

  if (!user) throw new UnauthorizedException('Invalid token');

- const yachtIds = user.yachtAccesses.map((x) => x.x.yachtId);
- const roleName = user.role?.name ?? payload.role ?? 'Captain';
+ const roleName = user.role?.name ?? payload.role ?? 'Captain';
+ 
+ // Re-calcular yachtIds para SystemAdmin
+ let yachtIds: string[];
+ if (roleName === 'SystemAdmin') {
+   const allYachts = await this.prisma.yacht.findMany({ select: { id: true } });
+   yachtIds = allYachts.map((y) => y.id);
+ } else {
+   yachtIds = user.yachtAccesses.map((x) => x.yachtId);
+ }

  return this.signTokens({ sub: user.id, role: roleName, yachtIds });
```

---

### P0-03: Endpoints de Alertas y Timeline Sin Autenticación
**Archivos:**
- [`apps/api/src/modules/alerts/alerts.controller.ts:1-11`](apps/api/src/modules/alerts/alerts.controller.ts:1-11)
- [`apps/api/src/modules/timeline/timeline.controller.ts:1-12`](apps/api/src/modules/timeline/timeline.controller.ts:1-12)

```typescript
@Controller('alerts')
export class AlertsController {  // ❌ NO @UseGuards(JwtAuthGuard)
  @Get(':yachtId')
  list(@Param('yachtId') yachtId: string) {
    return this.alertsService.listByYacht(yachtId);
  }
}
```

**Problema:** Estos controllers NO tienen `@UseGuards(JwtAuthGuard)`. CUALQUIERA con acceso a la URL puede obtener datos sensibles de yates.

**Impacto:** Data breach completo - exposición de alertas de seguridad y agenda de operaciones.

**Fix:**
```diff
@Controller('alerts')
+ @UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
export class AlertsController {
  @Get(':yachtId')
+ @YachtScope()
  list(@Param('yachtId') yachtId: string) { ... }
}

@Controller('timeline')
+ @UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
export class TimelineController {
  @Get(':yachtId')
+ @YachtScope()
  getAgenda(@Param('yachtId') yachtId: string) { ... }
}
```

---

### P0-04: Role Elevation sin Restricción
**Archivo:** [`apps/api/src/common/guards/roles.guard.ts:44`](apps/api/src/common/guards/roles.guard.ts:44)

```typescript
const finalRole = access?.roleNameOverride || effectiveRole;
return roles.includes(finalRole);
```

**Problema:** `roleNameOverride` puede ELEVAR privilegios sin restricción. Un usuario con role "Crew Member" global puede tener override a "Captain" para un yacht específico.

**Impacto:** Escalación de privilegios - usuarios de bajo nivel pueden obtener permisos de admin.

**Decisiones Requeridas:**
1. **¿Permitir elevation?** Si NO: solo permitir roles iguales o inferiores al role global
2. **¿Validar roles?** No hay validación de que `roleNameOverride` sea un role válido del enum

**Opción A - NO ELEVATION (Recomendado):**
```diff
const finalRole = access?.roleNameOverride || effectiveRole;
+ 
+ // Validate: roleNameOverride cannot elevate beyond user's global role
+ if (access?.roleNameOverride) {
+   const roleHierarchy = {
+     'SystemAdmin': 100,
+     'Admin': 90,
+     'Management/Office': 80,
+     'Captain': 70,
+     'Chief Engineer': 60,
+     'HoD': 50,
+     'Crew Member': 10
+   };
+   
+   const userLevel = roleHierarchy[effectiveRole] || 0;
+   const overrideLevel = roleHierarchy[access.roleNameOverride] || 0;
+   
+   if (overrideLevel > userLevel) {
+     throw new ForbiddenException('Role override cannot elevate privileges');
+   }
+ }
+ 
return roles.includes(finalRole);
```

**Opción B - VALIDACIÓN SIMPLE:**
```diff
+ const validRoles = Object.values(RoleName);
+ if (access?.roleNameOverride && !validRoles.includes(access.roleNameOverride)) {
+   throw new BadRequestException('Invalid roleNameOverride');
+ }
```

---

## ⚠️ HALLAZGOS ALTOS P1

### P1-01: YachtScopeGuard Aplicado Globalmente
**Archivo:** [`apps/api/src/modules/logbook/logbook.controller.ts:26`](apps/api/src/modules/logbook/logbook.controller.ts:26)

```typescript
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)  // ❌ Global
export class LogbookController {
  @Get('logbook/entries/:id')  // ❌ No tiene @YachtScope()
  getEntry(@Param('id') id: string) { ... }
}
```

**Problema:** `YachtScopeGuard` está aplicado a nivel de controller, pero algunos endpoints NO requieren yachtId (ej: `getEntry` usa `:id` que es un logbookEntry ID, no yachtId).

**Impacto:** `getEntry` fallará siempre porque YachtScopeGuard requiere yachtId pero el endpoint no lo pasa.

**Validación en LogbookService:**
```typescript
// logbook.service.ts
async getEntry(id: string, yachtIds: string[]) {
  const entry = await this.prisma.logBookEntry.findUnique({ where: { id } });
  
+ // Manual yacht scope validation
+ if (!yachtIds.includes(entry.yachtId)) {
+   throw new ForbiddenException('No access to this yacht');
+ }
  
  return entry;
}
```

**Fix:**
```diff
@Controller()
- @UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
+ @UseGuards(JwtAuthGuard, RolesGuard)
export class LogbookController {
  @Post('logbook/entries')
  @Roles('Chief Engineer', 'Crew Member')
+ @UseGuards(YachtScopeGuard)
  @YachtScope()
  createEntry(@Req() req, @Body() body) { ... }
  
  @Get('logbook/entries')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Admin')
+ @UseGuards(YachtScopeGuard)
  @YachtScope()
  listEntries(@Query('yachtId') yachtId: string) { ... }
  
  @Get('logbook/entries/:id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
- // NO YachtScopeGuard - validar en service
  getEntry(@Param('id') id: string, @Req() req) { ... }
}
```

---

### P1-02: Inconsistencia en Extracción de yachtId
**Archivos:**
- [`roles.guard.ts:22-23`](apps/api/src/common/guards/roles.guard.ts:22-23)
- [`yacht-scope.guard.ts:21`](apps/api/src/common/guards/yacht-scope.guard.ts:21)

```typescript
// RolesGuard
const yachtId = request.query?.yachtId || request.params?.yachtId || request.body?.yachtId;

// YachtScopeGuard
const yachtId = request.params?.yachtId || request.params?.id || request.body?.yachtId || request.query?.yachtId;
```

**Problema:** Los guards usan ORDENA DIFERENTE para extraer yachtId:
- **RolesGuard**: query → params → body
- **YachtScopeGuard**: params → body → query

**Impacto:** Inconsistencia en qué yachtId se usa cuando hay múltiples fuentes.

**Fix:** Crear helper único:
```diff
+ // common/utils/extract-yacht-id.ts
+ export function extractYachtId(request: any): string | undefined {
+   return request.params?.yachtId || 
+          request.params?.id || 
+          request.query?.yachtId || 
+          request.body?.yachtId;
+ }

// En ambos guards
- const yachtId = ... // lógica repetida
+ const yachtId = extractYachtId(request);
```

---

### P1-03: Double YachtScope Validation
**Archivos:**
- [`logbook.controller.ts:40-45`](apps/api/src/modules/logbook/logbook.controller.ts:40-45)
- [`logbook.controller.ts:92-94`](apps/api/src/modules/logbook/logbook.controller.ts:92-94)

```typescript
@Get('logbook/entries')
@YachtScope()
listEntries(@Query('yachtId') yachtId: string, ...) {  // ❌ yachtId explícito
  return this.logbookService.listEntries(yachtId, ...);
}

@Get('engines')
@YachtScope()
listEngines(@Query('yachtId') yachtId: string, ...) {  // ❌ yachtId explícito
  return this.logbookService.listEngines(yachtId, ...);
}
```

**Problema:** 
- `@YachtScope()` ya valida que el user tiene acceso al yacht
- Pero el endpoint también recibe `yachtId` como parámetro
- **Redundancia**: YachtScopeGuard extrae yachtId de query/body/params y valida
- **Pero el service lo vuelve a validar**: `listEngines(yachtId, req.user.yachtIds || [])`

**Impacto:** Performance innecesaria (doble lookup en DB/cache).

**Fix:**
```diff
@Get('engines')
@Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
@YachtScope()
- listEngines(@Query('yachtId') yachtId: string, @Req() req) {
+ listEngines(@Req() req) {
+   const yachtId = req.yachtId; // YachtScopeGuard debería settear esto
    return this.logbookService.listEngines(yachtId, req.user.yachtIds);
  }
```

**Opción mejor:** YachtScopeGuard debe agregar `yachtId` al request:
```typescript
// yacht-scope.guard.ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  // ... validación ...
  
  if (access) {
    request.yachtId = yachtId; // Set for downstream use
    return true;
  }
  
  return false;
}
```

---

### P1-04: Frontend/Backend Desync
**Archivo:** [`web/lib/api.ts:23-25`](apps/web/lib/api.ts:23-25)

```typescript
const token = typeof window !== 'undefined' 
  ? localStorage.getItem('accessToken') 
  : null;
```

**Problema:** Tokens guardados en localStorage (XSS vulnerable) mientras que backend migra a httpOnly cookies.

**Impacto:** Cuando se implemente cookie-based auth, el frontend dejará de funcionar.

**Fix:** Migrar a cookies:
```diff
- const token = typeof window !== 'undefined' 
-   ? localStorage.getItem('accessToken') 
-   : null;
+ // HttpOnly cookies se envían automáticamente
+ // No necesitamos leer el token
+ const token = null; // Remover Authorization header
```

---

## 🔍 ENDPOINTS ANALYSIS - SCOPED vs GLOBAL

### Endpoints Scoped (Requieren yachtId)

| Endpoint | Controller | YachtScope | yachtId Source | Issue |
|----------|------------|------------|----------------|-------|
| `POST /logbook/entries` | Logbook | ✅ | `body.yachtId` | ✅ OK |
| `GET /logbook/entries` | Logbook | ✅ | `query.yachtId` | P1-03: Doble validación |
| `POST /engines` | Logbook | ✅ | `body.yachtId` | ✅ OK |
| `GET /engines` | Logbook | ✅ | `query.yachtId` | P1-03: Doble validación |
| `DELETE /engines/:id` | Logbook | ✅ | `body.yachtId` | ✅ OK |
| `GET /alerts/:yachtId` | Alerts | ❌ | `params.yachtId` | **P0-03: Sin auth** |
| `GET /timeline/:yachtId` | Timeline | ❌ | `params.yachtId` | **P0-03: Sin auth** |
| `POST /yachts/:id/access` | Yachts | ❌ | `params.id` | ✅ OK (admin) |
| `GET /yachts/:id/access` | Yachts | ❌ | `params.id` | ✅ OK (admin) |
| `PATCH /yachts/:id/access/:uid` | Yachts | ❌ | `params.id` | ✅ OK (admin) |

### Endpoints Global (NO requieren yachtId)

| Endpoint | Controller | YachtScope | Issue |
|----------|------------|------------|-------|
| `POST /yachts` | Yachts | ❌ | ✅ OK |
| `GET /yachts` | Yachts | ❌ | ✅ OK (lista filtered) |
| `GET /logbook/entries/:id` | Logbook | ❌ | ✅ OK (valida en service) |
| `GET /users/by-email` | Users | ❌ | ✅ OK |
| `GET /notifications/in-app/:userId` | Notifications | ❌ | ✅ OK |

**Errores Encontrados:**
1. **P0-03**: 2 endpoints sin auth
2. **P1-01**: 1 endpoint con YachtScope global pero no necesita yachtId
3. **P1-03**: 2 endpoints con doble validación (query param + YachtScope)

---

## 📋 STATUS CODES ANALYSIS

### Expected Behavior

| Scenario | Endpoint Type | Status Code | Body |
|----------|---------------|-------------|------|
| Token inválido/expirado | Any | 401 | `{ "message": "Unauthorized" }` |
| Token revocado | Any | 401 | `{ "message": "Token revoked" }` |
| Falta yachtId (scoped) | Scoped | 400 | `{ "message": "yachtId is required" }` |
| YachtId inválido | Scoped | 403 | `{ "message": "No access to this yacht" }` |
| Role no autorizado | Any | 403 | `{ "message": "Forbidden" }` |

### Current Implementation

**✅ Correcto:**
- [`yacht-scope.guard.ts:25-26`](apps/api/src/common/guards/yacht-scope.guard.ts:25-26): Lanza `BadRequestException` si falta yachtId
- [`jwt.strategy.ts`](apps/api/src/auth/jwt.strategy.ts): Retorna 401 si token inválido
- [`auth.service.ts:77`](apps/api/src/auth/auth.service.ts:77): Lanza `UnauthorizedException` si refresh token inválido

**⚠️ Inconsistente:**

```typescript
// roles.guard.ts:20-25
const userRole: string | undefined = request.user?.role;
const userId: string | undefined = request.user?.userId;

if (!userRole) return false;  // ❌ Retorna 403 Forbidden

// Pero debería ser:
if (!userRole) {
  throw new UnauthorizedException('Invalid token');  // ✅ 401
}
```

**Impacto:** Cuando falta `user.role` (token corrupto), el sistema retorna 403 Forbidden en lugar de 401 Unauthorized, confundiendo al cliente.

---

## 🛡️ MIDDLEWARE ANALYSIS (Next.js)

### Archivo: [`web/app/(protected)/layout.tsx`](apps/web/app/(protected)/layout.tsx)

```typescript
export default function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>  // ✅ Auth wrapper
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <TopBar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
```

**✅ Correcto:** No rompe auth - solo layout.

### Archivo: [`web/components/auth/protected-route.tsx`](apps/web/components/auth/protected-route.tsx)

```typescript
'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <div>Loading...</div>;
  if (!user) return null;

  return <>{children}</>;
}
```

**✅ Correcto:**
- Lee auth state del context
- No manipula tokens directamente
- Redirige si no hay usuario

**⚠️ Problema Futuro:**
Cuando migremos a httpOnly cookies, `ProtectedRoute` seguirá funcionando porque lee el user state, no los tokens directamente. ✅

### Archivo: [`web/lib/api.ts` - RACE CONDITION LOCK](apps/web/lib/api.ts:64-103)

```typescript
private refreshPromise: Promise<boolean> | null = null;

private async tryRefresh(): Promise<boolean> {
  if (this.refreshPromise) {
    return this.refreshPromise;  // ✅ Lock
  }

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  this.refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        this.refreshPromise = null;  // ❌ Race condition
        return false;
      }

      const data = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      this.refreshPromise = null;  // ❌ Race condition
      return true;
    } catch {
      this.refreshPromise = null;  // ❌ Race condition
      return false;
    }
  })();

  return this.refreshPromise;
}
```

**Problema:** Si una segunda llamada llega mientras la primera está en `await response.json()` (línea 91), la segunda esperará. Pero si la primera falla, `refreshPromise` se setea a `null` y la segunda llamada también fallará en lugar de reintentar.

**Escenario de Race:**
1. Request A: 401 → Llama `tryRefresh()` → set `refreshPromise`
2. Request B: 401 → Llega 1ms después → `return this.refreshPromise` ✅
3. Request A: Falla (network error) → `refreshPromise = null`
4. Request B: Sigue esperando la promise de A → Cuando A falla, B también falla ❌

**Fix:**
```diff
  private async tryRefresh(): Promise<boolean> {
+   // Check if already refreshing
    if (this.refreshPromise) {
-     return this.refreshPromise;
+     return this.refreshPromise;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

-   this.refreshPromise = (async () => {
+   // Use a lock that doesn't clear on failure
+   const refreshLock = new Promise<boolean>(async (resolve) => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
-         this.refreshPromise = null;
-         return false;
+         resolve(false);
+         return;
        }

        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
-       this.refreshPromise = null;
-       return true;
+       resolve(true);
      } catch {
-       this.refreshPromise = null;
-       return false;
+       resolve(false);
      }
-   })();
+   });

+   this.refreshPromise = refreshLock;
-   return this.refreshPromise;
+   const result = await refreshLock;
+   this.refreshPromise = null;  // Clear only after completion
+   return result;
  }
```

---

## 📊 LISTA DE ENDPOINTS CON PROBLEMAS

### Endpoints Sin Authentication (P0)
- [ ] `GET /alerts/:yachtId` → Add `@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)`
- [ ] `GET /timeline/:yachtId` → Add `@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)`

### Endpoints Con YachtScope Inconsistente (P1)
- [ ] `GET /logbook/entries/:id` → Remover YachtScopeGuard de controller level
- [ ] `GET /logbook/entries` → Remover @Query('yachtId') y usar `req.yachtId`
- [ ] `GET /engines` → Remover @Query('yachtId') y usar `req.yachtId`

### Endpoints Con Role Check Inconsistente (P0)
- [ ] `POST /yachts` → Add `SystemAdmin` to @Roles()
- [ ] `GET /yachts` → Verify SystemAdmin sees all yachts

---

## 🔧 CAMBIOS MÍNIMOS REQUERIDOS (SIN REESCRIBIR TODO)

### 1. Fix P0-01: SystemAdmin en Create Yacht

**Archivo:** [`apps/api/src/modules/yachts/yachts.controller.ts:14`](apps/api/src/modules/yachts/yachts.controller.ts:14)

```diff
  @Post()
- @Roles('Admin', 'Management/Office')
+ @Roles('SystemAdmin', 'Admin', 'Management/Office')
  createYacht(@Req() req, @Body() body) { ... }
```

**Testing:**
```bash
# Como SystemAdmin
POST /yachts → 201 Created ✅

# Como Admin
POST /yachts → 201 Created ✅

# Como Captain
POST /yachts → 403 Forbidden ✅
```

---

### 2. Fix P0-02: SystemAdmin en Refresh

**Archivo:** [`apps/api/src/auth/auth.service.ts:70-95`](apps/api/src/auth/auth.service.ts:70-95)

```diff
  async refresh(refreshToken: string) {
    let payload: { sub: string; role: string; yachtIds?: string[] };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: true,
        yachtAccesses: { select: { yachtId: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid token');

-   const yachtIds = user.yachtAccesses.map((x) => x.yachtId);
    const roleName = user.role?.name ?? payload.role ?? 'Captain';
+   
+   // Re-calcular yachtIds para SystemAdmin
+   let yachtIds: string[];
+   if (roleName === 'SystemAdmin') {
+     const allYachts = await this.prisma.yacht.findMany({ select: { id: true } });
+     yachtIds = allYachts.map((y) => y.id);
+   } else {
+     yachtIds = user.yachtAccesses.map((x) => x.yachtId);
+   }

    return this.signTokens({ sub: user.id, role: roleName, yachtIds });
  }
```

**Testing:**
```bash
# Login como SystemAdmin
POST /auth/login → { accessToken, refreshToken }

# Use refresh token
POST /auth/refresh → { accessToken, refreshToken }  // ✅ yachtIds = ALL

# Verify access token payload
decode(accessToken) → { sub, role: "SystemAdmin", yachtIds: [...allUuids] } ✅
```

---

### 3. Fix P0-03: Add Auth a Endpoints Públicos

**Archivo:** [`apps/api/src/modules/alerts/alerts.controller.ts:1-12`](apps/api/src/modules/alerts/alerts.controller.ts:1-12)

```diff
  import { Controller, Get, Param } from '@nestjs/common';
+ import { UseGuards } from '@nestjs/common';
+ import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
+ import { RolesGuard } from '../../common/guards/roles.guard';
+ import { YachtScopeGuard } from '../../common/guards/yacht-scope.guard';
+ import { YachtScope } from '../../common/decorators/yacht-scope.decorator';
  import { AlertsService } from './alerts.service';
  
  @Controller('alerts')
+ @UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
  export class AlertsController {
    constructor(private readonly alertsService: AlertsService) {}
  
    @Get(':yachtId')
+   @YachtScope()
    list(@Param('yachtId') yachtId: string) {
      return this.alertsService.listByYacht(yachtId);
    }
  }
```

**Testing:**
```bash
# Sin token
GET /alerts/:yachtId → 401 Unauthorized ✅

# Con token pero sin acceso al yacht
GET /alerts/:yachtId → 403 Forbidden ✅

# Con token y acceso
GET /alerts/:yachtId → 200 OK + data ✅
```

---

### 4. Fix P1-01: Remover YachtScopeGuard Global

**Archivo:** [`apps/api/src/modules/logbook/logbook.controller.ts:25-27`](apps/api/src/modules/logbook/logbook.controller.ts:25-27)

```diff
  @Controller()
- @UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
+ @UseGuards(JwtAuthGuard, RolesGuard)
  export class LogbookController {
    constructor(private readonly logbookService: LogbookService) {}
  
    @Post('logbook/entries')
    @Roles('Chief Engineer', 'Crew Member')
+   @UseGuards(YachtScopeGuard)
    @YachtScope()
    createEntry(@Req() req, @Body() body) { ... }
    
    @Get('logbook/entries')
    @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Admin')
+   @UseGuards(YachtScopeGuard)
    @YachtScope()
    listEntries(@Req() req, @Query('yachtId') yachtId: string) { ... }
    
    @Get('logbook/entries/:id')
    @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
-   // No YachtScope - validated in service
    getEntry(@Param('id') id: string, @Req() req) { ... }
  }
```

**Testing:**
```bash
# getEntry debería funcionar sin yachtId en params
GET /logbook/entries/:id → 200 OK (valida en service) ✅

# createEntry debería requerir yachtId
POST /logbook/entries (sin yachtId) → 400 Bad Request ✅
```

---

## 🧪 CHECKLIST DE PRUEBAS QA

### Pruebas Unitarias

```typescript
describe('RBAC System', () => {
  describe('SystemAdmin', () => {
    it('should see all yachts on login', async () => {
      const tokens = await authService.loginFromUser(systemAdminUser);
      const payload = decode(tokens.accessToken);
      expect(payload.yachtIds).toEqual(allYachtIds);
    });

    it('should see all yachts after refresh', async () => {
      const tokens = await authService.refresh(refreshToken);
      const payload = decode(tokens.accessToken);
      expect(payload.yachtIds).toEqual(allYachtIds);
    });

    it('should access any yacht endpoint', async () => {
      const req = mockRequest({ user: systemAdmin, yachtId: anyYachtId });
      expect(await yachtScopeGuard.canActivate(req)).toBe(true);
    });
  });

  describe('Role Override', () => {
    it('should NOT allow elevation beyond global role', async () => {
      const req = mockRequest({
        user: { role: 'Crew Member', userId: userId },
        yachtId: yachtId,
        // userYachtAccess has roleNameOverride: 'Captain'
      });
      
      // Should throw Forbidden
      await expect(rolesGuard.canActivate(req)).rejects.toThrow('Role override cannot elevate privileges');
    });

    it('should allow valid override', async () => {
      const req = mockRequest({
        user: { role: 'Captain', userId: userId },
        yachtId: yachtId,
        // userYachtAccess has roleNameOverride: 'Chief Engineer'
      });
      
      expect(await rolesGuard.canActivate(req)).toBe(true);
    });
  });
});
```

### Pruebas de Integración

```bash
#!/bin/bash
# test-auth-flow.sh

API_URL="http://localhost:3000/api"

# 1. Login como SystemAdmin
echo "Test 1: Login SystemAdmin"
RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}')
TOKEN=$(echo $RESPONSE | jq -r .accessToken)
REFRESH=$(echo $RESPONSE | jq -r .refreshToken)
echo "✅ Token: $TOKEN"

# 2. Verificar que tiene todos los yachts
echo "Test 2: SystemAdmin yachtIds"
PAYLOAD=$(echo $TOKEN | cut -d'.' -f2 | base64 -d)
YACHT_COUNT=$(echo $PAYLOAD | jq '.yachtIds | length')
echo "✅ Yachts: $YACHT_COUNT (should be ALL)"

# 3. Refresh token
echo "Test 3: Refresh token"
RESPONSE=$(curl -s -X POST "$API_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}")
NEW_TOKEN=$(echo $RESPONSE | jq -r .accessToken)
echo "✅ New token: $NEW_TOKEN"

# 4. Verificar que refresh mantiene access
echo "Test 4: Verify refresh preserves yachtIds"
NEW_PAYLOAD=$(echo $NEW_TOKEN | cut -d'.' -f2 | base64 -d)
NEW_YACHT_COUNT=$(echo $NEW_PAYLOAD | jq '.yachtIds | length')
echo "✅ Yachts after refresh: $NEW_YACHT_COUNT (should be ALL)"

# 5. Test alert endpoint sin auth (debe fallar)
echo "Test 5: Alerts sin auth (esperado 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/alerts/test-yacht-id")
echo "✅ Status: $STATUS (expected 401)"
if [ "$STATUS" = "401" ]; then echo "PASS"; else echo "FAIL ❌"; fi

# 6. Test alert endpoint con auth pero sin acceso
echo "Test 6: Alerts con auth pero sin acceso (esperado 403)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/alerts/test-yacht-id")
echo "✅ Status: $STATUS (expected 403)"
if [ "$STATUS" = "403" ]; then echo "PASS"; else echo "FAIL ❌"; fi
```

### Pruebas Manuales

- [ ] **Login Flow**
  - [ ] Login con credenciales correctas → 200 + tokens ✅
  - [ ] Login con credenciales incorrectas → 401 Unauthorized ✅
  - [ ] Login con email inexistente → 401 Unauthorized (no reveal) ✅

- [ ] **Refresh Flow**
  - [ ] Refresh con token válido → 200 + nuevos tokens ✅
  - [ ] Refresh con token inválido → 401 Unauthorized ✅
  - [ ] Refresh con token expirado → 401 Unauthorized ✅
  - [ ] **SystemAdmin refresh** → yachtIds = ALL ✅

- [ ] **Yacht Access**
  - [ ] Usuario sin acceso a yacht → 403 Forbidden ✅
  - [ ] SystemAdmin sin acceso explícito → 200 OK (bypass) ✅
  - [ ] Falta yachtId en scoped endpoint → 400 Bad Request ✅

- [ ] **Role Override**
  - [ ] Override válido (mismo nivel) → 200 OK ✅
  - [ ] Override de elevación → 403 Forbidden ✅
  - [ ] Override a role inválido → 400 Bad Request ✅

- [ ] **API Endpoints**
  - [ ] `GET /alerts/:yachtId` sin token → 401 ✅
  - [ ] `GET /timeline/:yachtId` sin token → 401 ✅
  - [ ] `GET /alerts/:yachtId` sin acceso → 403 ✅
  - [ ] `POST /yachts` como SystemAdmin → 201 Created ✅

---

## 📈 RESUMEN DE CAMBIOS

| Tipo | Archivo | Líneas | Cambio | Prioridad |
|------|---------|--------|--------|-----------|
| Fix | `yachts.controller.ts` | 14 | Add SystemAdmin a @Roles | P0 |
| Fix | `auth.service.ts` | 81-94 | Recalcular yachtIds en refresh | P0 |
| Fix | `alerts.controller.ts` | 1-12 | Add auth guards | P0 |
| Fix | `timeline.controller.ts` | 1-12 | Add auth guards | P0 |
| Fix | `logbook.controller.ts` | 26 | Remover YachtScopeGuard global | P1 |
| Fix | `roles.guard.ts` | 20-25 | Throw 401 si no hay user.role | P1 |
| Fix | `api.ts` | 23-25 | Preparar para cookies | P2 |

**Total:** 7 archivos, 9 cambios, P0: 4, P1: 2, P2: 1

**Estimado:** 2-3 días de implementación + 1 día de testing

---

## 🎯 DECISIONES ARQUITECTÓNICAS PENDIENTES

### 1. Semántica de Admin vs SystemAdmin

**Pregunta:** ¿`Admin` es un role de yate o global?

**Opción A** (Recomendado):
- `SystemAdmin`: Acceso global, puede gestionar users, roles, system settings
- `Admin`: Acceso por yate (ej: "Admin" del Yacht 1), puede gestionar ese yate
- `Management/Office`: Acceso multi-yate pero no full admin

**Implicación:** Cambiar `yachts.controller.ts:14` a `@Roles('SystemAdmin', 'Management/Office')` y remover `Admin` de crear yates.

### 2. Role Elevation Policy

**Pregunta:** ¿Puede `roleNameOverride` elevar privilegios?

**Opción A** (Recomendado - Seguridad):
- NO permitir elevation
- Solo permitir override a role de igual o menor nivel
- Requiere implementar hierarchy en `roles.guard.ts`

**Opción B** (Flexibilidad):
- Permitir elevation con aprobación manual
- Log auditable de todas las elevations
- Requiere `approvedBy` field en `userYachtAccess`

### 3. Token Claims

**Pregunta:** ¿Qué incluir en JWT?

**Opción A** (Recomendado):
```typescript
interface AccessToken {
  sub: string;              // userId
  role: string;             // global role
  yachtAccessHash: string;  // SHA256 de lista
  permissionsHash: string;  // SHA256 de perms
  jti: string;              // JWT ID
  iat: number; exp: number; // timestamps
}
```
- Pros: Token pequeño (<500 bytes)
- Cons: Requiere DB lookup para lista completa

**Opción B** (Current):
```typescript
interface AccessToken {
  sub: string;
  role: string;
  yachtIds: string[];  // ❌ Crece con SystemAdmin
  jti: string;
  iat: number; exp: number;
}
```
- Pros: No necesita DB lookup inicial
- Cons: Token puede exceder 8KB con 1000+ yachts

---

## ✅ CONCLUSIONES

### Hallazgos Críticos
1. **4 P0** - Requieren fix inmediato (data breach, privilege escalation)
2. **3 P1** - Requieren fix en próximo sprint (performance, UX)
3. **Inconsistencia semántica** entre Admin/SystemAdmin
4. **Auth incompleta** en 2 controllers (alerts, timeline)

### Recomendaciones
1. **Implementar fixes P0 primero** (2-3 días)
2. **Auditoría de roles** - Definir claramente Admin vs SystemAdmin
3. **Implementar role hierarchy** - Prevenir elevation no autorizada
4. **Migrar a httpOnly cookies** - Mitigar XSS (separado de este fix)
5. **Añadir rate limiting** - Prevenir brute force (separado)

### Riesgos si no se fixea
- **Data breach** - Endpoints públicos exponen info sensible
- **Privilege escalation** - Users pueden obtener permisos de admin
- **SystemAdmin blind** - Después de refresh, pierde acceso global
- **Inconsistencias en auth** - Bypass semántico vs implementación

**Prioridad: ALTA** - Fixear P0 antes de próximo deploy a producción