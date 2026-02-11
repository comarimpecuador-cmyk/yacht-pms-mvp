# Sistema de Autenticación y Autorización - PMS Yacht Platform

## A) Mapa del Sistema - Componentes y Responsabilidades

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                          │
├─────────────────────────────────────────────────────────────────────┤
│ AuthContext (lib/auth-context.tsx)                                  │
│ - Gestiona estado de sesión (user, token, loading)                 │
│ - Maneja localStorage (accessToken, refreshToken, user)            │
│ - Implementa refresh token con race condition lock                 │
│ - Decodifica JWT para información básica                           │
│ - Eventos: auth:logout, redirección automática                    │
│                                                                     │
│ ApiClient (lib/api.ts)                                             │
│ - Interceptor de requests (agrega Authorization header)            │
│ - Manejo de 401s con reintento automático                          │
│ - Gestión de race conditions en refresh (refreshPromise lock)      │
│ - Redirección a /login en fallo de auth                           │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP/HTTPS
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Backend (NestJS API)                        │
├─────────────────────────────────────────────────────────────────────┤
│ Auth Controller (auth/auth.controller.ts)                          │
│ - POST /auth/login    : Email + Password → Tokens                  │
│ - POST /auth/refresh  : RefreshToken → Nuevos tokens               │
│ - POST /auth/logout   : Invalida refresh token (pendiente)         │
│ - POST /auth/logout-all: Invalida todos los tokens (pendiente)     │
│                                                                     │
│ Auth Service (auth/auth.service.ts)                                │
│ - validateUser(): Verifica email/password contra DB                │
│ - signTokens(): Genera JWT access + refresh                        │
│ - loginFromUser(): Asigna yachtIds (SystemAdmin=getAll)            │
│ - refresh(): Relee DB para actualizar claims                       │
│ - logout(): Revoca tokens en lista negra (pendiente)               │
│                                                                     │
│ JWT Strategy (auth/jwt.strategy.ts)                                │
│ - Valida access token (signature, expiración)                      │
│ - Extrae claims: userId, role, yachtIds                            │
│ - Config: fromAuthHeaderAsBearerToken()                            │
│                                                                     │
│ Authorization Layer                                                 │
│ ├─ RolesGuard (common/guards/roles.guard.ts)                      │
│ │  - @Roles() decorator → array de roles permitidos                │
│ │  - SystemAdmin bypass                                            │
│ │  - Yacht-specific role override (userYachtAccess.roleNameOverride)│
│ │  - Resuelve efectivo: query → params → body                     │
│ │                                                                     │
│ └─ YachtScopeGuard (common/guards/yacht-scope.guard.ts)           │
│    - @YachtScope() decorator                                       │
│    - Valida userId+yachtId en userYachtAccess                      │
│    - SystemAdmin bypass                                            │
│    - Extrae yachtId: params → body → query                        │
│                                                                     │
│ Decorators                                                          │
│ - @Roles(...roles) (common/decorators/roles.decorator.ts)          │
│ - @YachtScope() (common/decorators/yacht-scope.decorator.ts)       │
│ - @CurrentUser() (pendiente)                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │ Prisma
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Persistencia (PostgreSQL)                   │
├─────────────────────────────────────────────────────────────────────┤
│ User                                                                │
│ - id, email, fullName, passwordHash, roleId                        │
│ - relationship: role, yachtAccesses                                │
│                                                                     │
│ Role                                                                │
│ - id, name (SystemAdmin, Captain, etc)                             │
│                                                                     │
│ Yacht                                                               │
│ - id, name, flag, imoOptional                                      │
│                                                                     │
│ UserYachtAccess (Tabla pivote CRITICAL)                            │
│ - userId, yachtId, roleNameOverride                                │
│ - Permite usuarios en múltiples yates con roles diferentes         │
│ - CONSTRAINT: userId_yachtId unique                               │
│                                                                     │
│ TokenBlacklist (Nueva tabla requerida)                             │
│ - tokenJti, revokedAt, expiresAt                                   │
│ - Para invalidación inmediata de tokens                            │
└─────────────────────────────────────────────────────────────────────┘
```

## B) Lista de Riesgos - P0/P1/P2

### 🚨 RIESGOS P0 (Críticos - Data Breach / Denegación de Servicio)

| ID | Riesgo | Impacto | Probabilidad | Mitigación Requerida |
|----|--------|---------|--------------|---------------------|
| P0-01 | **Token Theft via XSS** - Tokens en localStorage accesibles por JS malicioso | Alto | Media | Migrar a httpOnly cookies |
| P0-02 | **CSRF** - No hay protección contra ataques cross-site request forgery | Alto | Media | Implementar CSRF tokens + SameSite=Strict |
| P0-03 | **Token Invalidation Missing** - No hay logout real ni revocación | Alto | Alta | Implementar token blacklist + token versioning |
| P0-04 | **Race Condition Refresh** - Múltiples requests 401 refrescan simultáneamente | Alto | Alta | ✅ Implementado (refreshPromise lock) pero mejorar con token rotation |
| P0-05 | **CORS Misconfiguration** - Orígenes permitidos no validados | Alto | Baja | Auditar CORS origins, usar allowlist explícita |
| P0-06 | **SystemAdmin Bypass Logic** - Bypass harcodeado en múltiples guards | Medio | Alta | Centralizar bypass en single source of truth |

### ⚠️ RIESGOS P1 (Altos - Escalación de Privilegios / Data Leak)

| ID | Riesgo | Impacto | Probabilidad | Mitigación Requerida |
|----|--------|---------|--------------|---------------------|
| P1-01 | **Desync Frontend/Backend** - Frontend dice "Captain" pero DB tiene "Crew" | Medio | Alta | Siempre releer claims en refresh, no cachear roles |
| P1-02 | **YachtId Spoofing** - yachtId en query params puede ser manipulado | Medio | Media | Validar yachtId contra userYachtAccess en CADA request |
| P1-03 | **Token Size Bloat** - SystemAdmin con 1000+ yachts → JWT > 8KB | Medio | Baja | NO incluir todos los yachtIds en token, usar DB lookup |
| P1-04 | **Password Hash Strength** - bcrypt cost factor no configurable | Medio | Baja | Hacer rounds configurable via env var (min 12) |
| P1-05 | **Refresh Token Reuse** - Mismo refresh token usado múltiples veces | Medio | Media | Implementar token rotation (one-time use) |
| P1-06 | **rateLimiting Missing** - Brute force login/refresh posible | Medio | Alta | Implementar rate limiting por IP/email |

### 🔧 RIESGOS P2 (Medios - Errores de Usuario / Performance)

| ID | Riesgo | Impacto | Probabilidad | Mitigación Requerida |
|----|--------|---------|--------------|---------------------|
| P2-01 | **Session UX** - Expiración repentina sin advertencia | Bajo | Alta | Implementar session timeout warnings |
| P2-02 | **Token Exp Sync** - Clock drift entre servidor y cliente | Bajo | Media | Usar NTP sync, margen de 60s de grace |
| P2-03 | **Error Messages** - Mensajes de error revelan info del sistema | Bajo | Media | Normalizar mensajes, logging separado |
| P2-04 | **Prisma Instance** - Nuevo PrismaClient por request en guards | Bajo | Alta | Inyectar PrismaService correctamente |
| P2-05 | **Password Reset Flow** - No hay mecanismo de recuperación | Bajo | Alta | Implementar email reset flow con tokens OTP |

## C) Reglas Exactas de Autorización (Pseudo-Código)

### Regla 0: SystemAdmin Bypass
```typescript
// Se aplica ANTES que cualquier otra regla
if (user.role === 'SystemAdmin') {
  return true; // Bypass total - no checks adicionales
}
```

### Regla 1: Yacht Scope Validation
```typescript
// YachtScopeGuard - VALIDAR SIEMPRE PRIMERO
function canAccessYacht(request, user): boolean {
  const yachtId = extractYachtId(request); // params → body → query
  
  if (!yachtId) {
    throw BadRequestException('yachtId required');
  }
  
  // Verificar en userYachtAccess
  const access = await db.userYachtAccess.findUnique({
    where: { userId_yachtId: { userId, yachtId } }
  });
  
  return access !== null;
}
```

### Regla 2: Role-Based Access Control (RBAC)
```typescript
// RolesGuard - VALIDAR DESPUÉS DE YachtScope
function hasRequiredRole(request, user, requiredRoles): boolean {
  const yachtId = extractYachtId(request);
  
  // Obtener role base del usuario
  let effectiveRole = user.role; // del access token
  
  // Si hay yachtId y existe override específico, usar ese
  if (yachtId) {
    const access = await db.userYachtAccess.findUnique({
      where: { userId_yachtId: { userId, yachtId } },
      select: { roleNameOverride: true }
    });
    
    if (access?.roleNameOverride) {
      effectiveRole = access.roleNameOverride;
    }
  }
  
  // Verificar si el role efectivo está en los requeridos
  return requiredRoles.includes(effectiveRole);
}
```

### Regla 3: Combinación Completa (Endpoint Pattern)
```typescript
// EJEMPLO: Endpoint con ambos guards
@Post(':yachtId/logbook')
@YachtScope()  // Primero: valida acceso al yacht
@Roles('Captain', 'Chief Engineer')  // Segundo: valida permisos
async createLogbook(
  @Param('yachtId') yachtId: string,
  @Req() req: AuthenticatedRequest
) {
  // User ya validado por guards
  // req.user = { userId, role, yachtIds }
  
  // Guard adicional: verificar que el logbook pertenece al yacht
  const logbook = await db.logBookEntry.findUnique({
    where: { id: logbookId },
    select: { yachtId: true }
  });
  
  if (logbook?.yachtId !== yachtId) {
    throw ForbiddenException('Logbook does not belong to this yacht');
  }
  
  return await service.createLogbook(yachtId, req.user.userId, data);
}
```

### Regla 4: Multi-Yacht Assignment (SIN INFLAR TOKEN)
```typescript
// NO guardar todos los yachtIds en el JWT
// En su lugar, guardar solo:
type AccessTokenClaims = {
  sub: string;           // userId
  role: string;          // Role global (ej: 'Crew Member')
  yachtAccessHash: string; // Hash de la lista actual (ej: SHA256)
  jti: string;           // JWT ID para blacklist
  iat: number;           // Issued at
  exp: number;           // Expiration (15 min)
};

// En cada request que necesite lista de yates:
async function getUserYachts(userId: string): Promise<string[]> {
  // CACHE en Redis/DB con TTL=5min por userId
  const cacheKey = `user:yachts:${userId}`;
  
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Si no en cache, query DB
  const accesses = await db.userYachtAccess.findMany({
    where: { userId },
    select: { yachtId: true }
  });
  
  const yachtIds = accesses.map(a => a.yachtId);
  
  // Guardar en cache
  await redis.setex(cacheKey, 300, JSON.stringify(yachtIds));
  
  return yachtIds;
}

// Invalidar cache cuando:
// - Se grant/revoke acceso a yacht
// - Se actualiza roleNameOverride
```

### Regla 5: Permission Matrix (Ejemplos)
```typescript
// Definir matriz de permisos por role
const PERMISSIONS = {
  'SystemAdmin': {
    yachts: ['create', 'read', 'update', 'delete', 'grant-access'],
    users: ['create', 'read', 'update', 'delete'],
    logbook: ['read-all', 'update-any', 'delete-any']
  },
  'Captain': {
    yachts: ['read-assigned'],
    logbook: ['create', 'read', 'update-own', 'submit'],
    crew: ['read-assigned-yacht', 'manage-assignments']
  },
  'Chief Engineer': {
    yachts: ['read-assigned'],
    logbook: ['create-engine', 'read', 'update-own'],
    maintenance: ['create', 'read', 'update', 'approve']
  },
  'Crew Member': {
    yachts: ['read-assigned'],
    logbook: ['create-own', 'read', 'update-own-draft']
  }
};
```

## D) Diseño Canónico de Claims y Permisos

### Access Token (JWT) - MINIMALISTA
```typescript
interface AccessTokenClaims {
  // STANDARD JWT CLAIMS
  sub: string;           // User ID (UUID)
  role: string;          // Role global base (ej: 'Captain')
  jti: string;           // JWT ID (para blacklist)
  iat: number;           // Issued at (epoch)
  exp: number;           // Expires (15 minutos)
  
  // CUSTOM CLAIMS (MÍNIMOS)
  yachtAccessHash: string; // SHA256 de lista ordenada de yachtIds
  permissionsHash: string; // SHA256 de permisos calculados
  
  // NO INCLUIR:
  // ❌ yachtIds: string[]  // -> Infla token, usar DB/cache
  // ❌ email: string       // -> No necesario para auth
  // ❌ fullName: string    // -> No necesario para auth
}

// Ejemplo token size: ~300 bytes (vs 5KB+ si incluye yachtIds)
```

### Refresh Token (JWT) - MÁS DURADERO
```typescript
interface RefreshTokenClaims {
  sub: string;           // User ID
  jti: string;           // Refresh JWT ID
  tokenVersion: number;  // Versión para invalidación masiva
  iat: number;
  exp: number;           // Expires (7 días)
}
```

### Database - Source of Truth
```typescript
// userYachtAccess → AUTHORIZACIÓN REAL-TIME
table userYachtAccess {
  userId: string;        // FK a User
  yachtId: string;       // FK a Yacht
  roleNameOverride: string?; // Role específico para este yacht
  grantedBy: string;     // Quién otorgó acceso
  grantedAt: Date;       // Cuándo
  
  // Si roleNameOverride es NULL, usar user.role
  // Si roleNameOverride tiene valor, SOBREESCRIBE para este yacht
}

// tokenBlacklist → INVALIDACIÓN INMEDIATA
table tokenBlacklist {
  jti: string;           // JWT ID del token revocado
  revokedAt: Date;       // Cuándo se revocó
  expiresAt: Date;       // Cuándo expira naturalmente (para cleanup)
  reason: string;        // 'logout', 'password-change', 'suspicious'
}

// userSession → TRACKING DE SESIONES ACTIVAS
table userSession {
  userId: string;
  tokenVersion: number;  // Incrementar en: password reset, logout-all, security event
  lastSeenAt: Date;
  ipAddress: string;
  userAgent: string;
}
```

### Caching Strategy
```typescript
// Redis cache keys
const CACHE_KEYS = {
  USER_YACHTS: (userId) => `user:yachts:${userId}`,     // TTL: 5 min
  USER_PERMISSIONS: (userId) => `user:perms:${userId}`, // TTL: 5 min
  TOKEN_BLACKLIST: (jti) => `blacklist:${jti}`,        // TTL: hasta exp
  YACHT_ACCESS: (userId, yachtId) => `access:${userId}:${yachtId}`, // TTL: 1 min
};

// Invalidación de cache
async function invalidateUserCache(userId: string) {
  await redis.del(
    CACHE_KEYS.USER_YACHTS(userId),
    CACHE_KEYS.USER_PERMISSIONS(userId)
  );
}

// Invalidar cuando:
// - Se grant/revoke acceso a yacht
// - Se actualiza roleNameOverride
// - User role global cambia
```

## E) Plan de Cambios Mínimo (Sin Reescribir Todo)

### Fase 1: Riesgos Críticos P0 (1-2 semanas)

#### 1.1 Implementar Token Blacklist
```bash
# DB Migration
npx prisma migrate dev --name add-token-blacklist
```

```typescript
// auth/auth.service.ts - AÑADIR
async logout(accessToken: string, refreshToken: string) {
  // Invalidar ambos tokens
  await this.blacklistToken(accessToken, 'logout');
  await this.blacklistToken(refreshToken, 'logout');
  
  // Invalidar cache del usuario
  await this.invalidateUserCache(payload.sub);
}

private async blacklistToken(token: string, reason: string) {
  const payload = this.jwtService.decode(token);
  if (!payload?.jti) return;
  
  await this.prisma.tokenBlacklist.create({
    data: {
      jti: payload.jti,
      revokedAt: new Date(),
      expiresAt: new Date(payload.exp * 1000),
      reason
    }
  });
  
  // Cache en Redis por 15 min (hasta expiración natural)
  await this.redis.setex(`blacklist:${payload.jti}`, 900, '1');
}
```

```typescript
// auth/jwt.strategy.ts - MODIFICAR
async validate(payload: JwtPayload) {
  // Verificar si token está en blacklist
  const isBlacklisted = await this.redis.get(`blacklist:${payload.jti}`);
  if (isBlacklisted) {
    throw new UnauthorizedException('Token revoked');
  }
  
  return {
    userId: payload.sub,
    role: payload.role,
    yachtAccessHash: payload.yachtAccessHash,
    permissionsHash: payload.permissionsHash,
  };
}
```

#### 1.2 Fix Prisma Instance en Guards
```typescript
// common/guards/roles.guard.ts - MODIFICAR
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService  // INYECTAR en lugar de new PrismaClient()
  ) {}
  // ... resto igual
}
```

#### 1.3 Implementar Token Versioning
```typescript
// prisma/schema.prisma - AÑADIR
model User {
  // ... campos existentes
  tokenVersion Int @default(0)  // Añadir este campo
}

// auth/auth.service.ts - MODIFICAR
async signTokens(payload: { sub: string; role: string }) {
  // Leer tokenVersion del user
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true }
  });
  
  const accessToken = await this.jwtService.signAsync({
    ...payload,
    jti: uuid(),
    tokenVersion: user.tokenVersion
  }, { expiresIn: '15m' });
  
  const refreshToken = await this.jwtService.signAsync({
    sub: payload.sub,
    jti: uuid(),
    tokenVersion: user.tokenVersion
  }, { expiresIn: '7d' });
  
  return { accessToken, refreshToken };
}

// auth/jwt.strategy.ts - MODIFICAR
async validate(payload: JwtPayload) {
  // Verificar tokenVersion
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true }
  });
  
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new UnauthorizedException('Token version mismatch');
  }
  
  // ... resto de validación
}
```

### Fase 2: Seguridad Mejorada P1 (2-3 semanas)

#### 2.1 Migrar a HttpOnly Cookies
```typescript
// auth/auth.controller.ts - MODIFICAR
@Post('login')
async login(@Body() body: LoginDto, @Res() res: Response) {
  const tokens = await this.authService.loginWithEmail(body.email, body.password);
  
  // Set httpOnly cookies
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 min
    path: '/'
  });
  
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    path: '/',
    // NO enviar en requests de primera parte (CSRF protection)
    // Usar header X-CSRF-Token para requests state-changing
  });
  
  res.json({ success: true });
}
```

```typescript
// auth/jwt.strategy.ts - MODIFICAR
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => request?.cookies?.accessToken, // Leer de cookie
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }
  // ... validate() igual
}
```

```typescript
// web/lib/api.ts - MODIFICAR
// REMOVER manejo manual de tokens
// El navegador envía cookies automáticamente
class ApiClient {
  async request<T>(method: string, endpoint: string, body?: object): Promise<T> {
    // NO enviar Authorization header
    const headers = { 'Content-Type': 'application/json' };
    
    // Para mutaciones, agregar CSRF token
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = await this.getCsrfToken();
    }
    
    const response = await fetch(url, { method, headers, body });
    // ... manejo de 401 igual
  }
  
  private async getCsrfToken(): Promise<string> {
    // Obtener CSRF token de endpoint /auth/csrf
    // Cachear por 5 minutos
  }
}
```

#### 2.2 Implementar Redis Cache
```bash
# Instalar Redis
docker run -d -p 6379:6379 redis:7-alpine

# Instalar dependencia
pnpm add @nestjs/cache-manager cache-manager-redis-store
```

```typescript
// api/src/cache.module.ts
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      ttl: 300, // 5 minutos default
    }),
  ],
})
export class RedisCacheModule {}
```

```typescript
// common/guards/yacht-scope.guard.ts - MODIFICAR
@Injectable()
export class YachtScopeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ... lógica de extracción
    
    const cacheKey = `access:${userId}:${yachtId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached !== null) return Boolean(cached);
    
    const hasAccess = await this.validateAccess(userId, yachtId);
    await this.cacheManager.set(cacheKey, hasAccess, 60); // 1 min
    
    return hasAccess;
  }
}
```

### Fase 3: Refinamiento P2 (1 semana)

#### 3.1 Implementar Rate Limiting
```bash
pnpm add @nestjs/throttler
```

```typescript
// api/src/app.module.ts
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minuto
      limit: 10,  // 10 requests
    }]),
  ],
})
```

```typescript
// auth/auth.controller.ts
@UseGuards(ThrottlerGuard)
@Post('login')
async login() { /* ... */ }
```

#### 3.2 Mejorar Manejo de Errores
```typescript
// common/filters/auth-exceptions.filter.ts
@Catch(UnauthorizedException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    // Log detallado en servidor
    console.error('Auth failed:', {
      path: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      error: exception.message
    });
    
    // Respuesta genérica al cliente
    response.status(401).json({
      message: 'Authentication required',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Resumen de Cambios por Archivo

| Archivo | Cambios | Esfuerzo | Riesgo |
|---------|---------|----------|--------|
| `prisma/schema.prisma` | Add tokenVersion, tokenBlacklist | Bajo | Bajo |
| `auth/auth.service.ts` | Add logout, blacklist, tokenVersion | Medio | Medio |
| `auth/jwt.strategy.ts` | Add blacklist check, tokenVersion | Bajo | Bajo |
| `auth/auth.controller.ts` | Add logout endpoint, cookies | Medio | Medio |
| `common/guards/*.ts` | Fix Prisma injection, add cache | Bajo | Bajo |
| `web/lib/api.ts` | Remove localStorage, use cookies | Medio | Medio |
| `web/lib/auth-context.tsx` | Update for cookie-based auth | Medio | Medio |
| `docker-compose.yml` | Add Redis service | Bajo | Bajo |

**Total Estimado: 4-6 semanas para implementación completa**

### Rollback Plan

Si algo sale mal:
1. **Feature flags**: Implementar bajo `ENABLE_NEW_AUTH=true`
2. **Dual mode**: Soportar tanto cookies como localStorage temporalmente
3. **Monitoreo**: Logging extensivo de errores de auth
4. **Gradual rollout**: Deployear a 1% → 10% → 100% de usuarios