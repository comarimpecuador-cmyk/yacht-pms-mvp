# 🍪 ARQUITECTURA HTTP-ONLY COOKIES - LOGIN PRODUCCIÓN-READY

**Fecha:** 2026-02-10  
**Versión:** 2.0  
**Estado:** Plan de Implementación  
**Prioridad:** CRÍTICA - Única solución robusta

---

## 🔍 PROBLEMA RAÍZ

El sistema actual (JWT en localStorage) es inherentemente inestable con Next.js Fast Refresh porque:

1. **Fast Refresh** reconstruye componentes perdiendo estado de React
2. **Token en localStorage** requiere sincronización manual con estado
3. **Timing issues** entre mount, state update y redirect
4. **Protección inexistente** contra XSS (tokens accesibles por JS)

**Resultado:** Login funcionalmente imposible de estabilizar con arquitectura actual.

---

## ✅ SOLUCIÓN: HTTP-ONLY COOKIES

### Ventajas Críticas:

1. **100% estable** - No depende de estado de React
   - Cookies se envían automáticamente en cada request
   - No necesita sincronización manual
   - No afecta Fast Refresh

2. **Seguridad real** - Mitiga XSS
   - Tokens no accesibles por JavaScript
   - No pueden ser leídos por XSS attacks

3. **Simplicidad** - Elimina lógica compleja
   - No necesita refresh token locking
   - No necesita manejo de race conditions
   - Código más limpio y mantenible

4. **Estándar de industria** - Usado por Stripe, GitHub, Auth0

---

## 🏗️ ARQUITECTURA COMPLETA

### Componentes del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                       │
├─────────────────────────────────────────────────────────────┤
│ 1. Login Form → POST /api/auth/login                      │
│    - Email + Password en body                             │
│    - NO envía Authorization header                        │
│    - credentials: 'include' (envía cookies)               │
│                                                             │
│ 2. AuthContext (solo para UI state)                       │
│    - user: { id, email, role, yachtIds }                 │
│    - NO almacena tokens                                   │
│    - Lee user de /api/auth/me                            │
│                                                             │
│ 3. ApiClient                                              │
│    - NO lee localStorage                                  │
│    - NO envía headers manuales                            │
│    - credentials: 'include' en todos los requests        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/HTTPS (Cookies automáticas)
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (NestJS)                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Auth Controller (POST /api/auth/login)                 │
│    - Verifica email/password                              │
│    - Genera JWT tokens                                    │
│    - SET HTTP-ONLY COOKIES:                              │
│      • accessToken (15 min)                              │
│      • refreshToken (7 días)                             │
│    - Response: { success: true }                         │
│                                                             │
│ 2. JWT Strategy                                          │
│    - Lee token de request.cookies.accessToken            │
│    - Valida firma y expiración                           │
│    - Extrae claims                                       │
│                                                             │
│ 3. Middleware Cookie Parser                            │
│    - Parse request.cookies                               │
│                                                             │
│ 4. Guards (Roles, YachtScope)                          │
│    - Requieren req.user (set por passport)              │
│    - Validan acceso normalmente                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Prisma
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE (PostgreSQL)                  │
├─────────────────────────────────────────────────────────────┤
│ User                                                      │
│ Role                                                      │
│ Yacht                                                     │
│ UserYachtAccess                                           │
│ TokenBlacklist (para revoke)                            │
│ UserSession (tokenVersion tracking)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 DETALLES DE IMPLEMENTACIÓN

### 1. Backend - Auth Controller

**Archivo:** `apps/api/src/auth/auth.controller.ts`

```typescript
import { Controller, Post, Body, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto, @Res() res: Response) {
    try {
      const tokens = await this.authService.loginWithEmail(body.email, body.password);

      // SET HTTP-ONLY COOKIES
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutos
        path: '/',
      });

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
        path: '/',
      });

      return res.json({ success: true });
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    // Refresh token está en req.cookies.refreshToken
    try {
      const newTokens = await this.authService.refresh(req.cookies.refreshToken);

      // Actualizar cookies con nuevos tokens
      res.cookie('accessToken', newTokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });

      return res.json({ success: true });
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    // Limpiar cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return res.json({ success: true });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    return {
      user: req.user,
    };
  }
}
```

### 2. Backend - JWT Strategy

**Archivo:** `apps/api/src/auth/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.accessToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email, // Añadir si está en JWT
      role: payload.role,
      yachtIds: payload.yachtIds || [],
    };
  }
}
```

### 3. Backend - Main Configuration

**Archivo:** `apps/api/src/main.ts`

```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS - Permitir frontend con credentials
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  // Cookie Parser - ESSENTIAL para leer cookies
  app.use(cookieParser());

  // Global Prefix
  app.setGlobalPrefix('api');

  // Validation Pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT || 4000);
}
bootstrap();
```

### 4. Frontend - ApiClient

**Archivo:** `apps/web/lib/api.ts`

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

class ApiClient {
  private baseUrl = API_URL;

  async request<T>(
    method: string,
    endpoint: string,
    body?: object
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // FIX: NO leer token de localStorage
    // FIX: NO enviar Authorization header
    // Cookies se envían automáticamente con credentials: 'include'

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', // ✅ ENVÍA COOKIES AUTOMÁTICAMENTE
    });

    if (response.status === 401) {
      // Intentar refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request(method, endpoint, body); // Reintentar
      }

      // Logout
      if (typeof window !== 'undefined') {
        window.location.href = '/login'; // Forzar logout completo
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      // Refresh token está en cookie httpOnly
      // Solo necesitamos llamar al endpoint, backend maneja todo
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Enviar cookies (incluye refreshToken)
      });

      return response.ok; // Backend actualiza cookies si success
    } catch {
      return false;
    }
  }

  post<T>(endpoint: string, body?: object) {
    return this.request<T>('POST', endpoint, body);
  }

  get<T>(endpoint: string) {
    return this.request<T>('GET', endpoint);
  }

  patch<T>(endpoint: string, body?: object) {
    return this.request<T>('PATCH', endpoint, body);
  }

  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

export const api = new ApiClient();

// Métodos de auth
export const login = (email: string, password: string) =>
  api.post<{ success: boolean }>('/api/auth/login', { email, password });

export const refresh = () =>
  api.post<{ success: boolean }>('/api/auth/refresh', {});

export const logout = () =>
  api.post<{ success: boolean }>('/api/auth/logout', {});

export const getProfile = () =>
  api.get<{ user: User }>('/api/auth/me');
```

### 5. Frontend - AuthContext

**Archivo:** `apps/web/lib/auth-context.tsx`

```typescript
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getProfile, logout as apiLogout } from './api';

interface User {
  id: string;
  email: string;
  role: string;
  yachtIds: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Bootstrap: Cargar perfil desde backend
  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const { user } = await getProfile();
        if (isMounted) {
          setUser(user);
        }
      } catch (error) {
        // Si falla, usuario no está autenticado
        setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login: async () => {}, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### 6. Frontend - ProtectedRoute

**Archivo:** `apps/web/components/auth/protected-route.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  // IMPORTANTE: NUNCA retornar null
  // Si user es null, redirect ocurrirá en useEffect
  // Mientras tanto, mostrar nothing o loading
  if (!user) {
    return null; // o <div /> - esto es temporal hasta redirect
  }

  return <>{children}</>;
}
```

---

## 🔐 SEGURIDAD AVANZADA (Phase 2)

### CSRF Protection

```typescript
// auth.controller.ts - Añadir CSRF token
@Post('login')
async login(...) {
  // ... existing login logic ...
  
  // Generate CSRF token (different from auth token)
  const csrfToken = crypto.randomBytes(32).toString('hex');
  
  // Store in DB/Cache associated with user/session
  await this.csrfService.storeToken(userId, csrfToken);
  
  // Send in regular cookie (not httpOnly - frontend needs to read it)
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false, // Frontend JavaScript necesita leerlo
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  
  return res.json({ success: true });
}

// Gateway/Interceptor - Validar CSRF en mutaciones
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const csrfCookie = request.cookies.csrfToken;
    const csrfHeader = request.headers['x-csrf-token'];
    
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new UnauthorizedException('Invalid CSRF token');
    }
    
    return true;
  }
}
```

### Rate Limiting

```typescript
// auth.controller.ts
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@UseGuards(ThrottlerGuard)
@Throttle(5, 600) // 5 intentos por IP cada 10 minutos
@Post('login')
async login() { }
```

### Token Versioning (Revocation)

```typescript
// prisma/schema.prisma
model User {
  // ... existing fields ...
  tokenVersion Int @default(0)
}

// auth.service.ts - Incrementar en eventos de seguridad
async resetPassword(userId: string) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

// jwt.strategy.ts - Validar tokenVersion
async validate(payload: any) {
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true }
  });
  
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new UnauthorizedException('Token version mismatch');
  }
  
  return payload;
}
```

---

## 📦 DEPENDENCIAS

```bash
# Backend
npm install --save cookie-parser @types/cookie-parser
npm install --save-dev @types/express

# Opcional pero recomendado
npm install --save @nestjs/throttler @nestjs/config

# Frontend
# No necesita nuevas dependencias, usa fetch API nativa
```

---

## 📊 ESTIMADO DE TIEMPO

| Phase | Descripción | Tiempo |
|-------|-------------|--------|
| 1 | Backend - Cookies setup | 4-6 horas |
| 2 | Frontend - Refactor ApiClient | 4-6 horas |
| 3 | Frontend - Refactor AuthContext | 3-4 horas |
| 4 | Testing & QA | 4-6 horas |
| **Total** | **Implementación completa** | **15-22 horas** |

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Backend
- [ ] Install cookie-parser
- [ ] Update main.ts (app.use(cookieParser()))
- [ ] Refactor auth.controller.ts (login con cookies)
- [ ] Refactor auth.controller.ts (logout)
- [ ] Refactor auth.controller.ts (getMe)
- [ ] Refactor jwt.strategy.ts (leer de cookies)
- [ ] Test endpoints con curl

### Frontend
- [ ] Refactor api.ts (remover token code, añadir credentials)
- [ ] Refactor auth-context.tsx (no usar localStorage)
- [ ] Update protected-route.tsx (verificar cookie)
- [ ] Test login flow
- [ ] Test refresh flow
- [ ] Test logout flow

### Seguridad (Optional Phase 2)
- [ ] Install @nestjs/throttler
- [ ] Configurar rate limiting
- [ ] Implementar CSRF tokens
- [ ] Token versioning
- [ ] Implementar token blacklist

---

## 🎯 ROADMAP

### Semana 1: Implementación Core
- Day 1-2: Backend
- Day 3-4: Frontend
- Day 5: Testing

### Semana 2: Seguridad Avanzada
- CSRF Protection
- Rate Limiting
- Token Versioning

### Semana 3: Deploy & Monitor
- Deploy a staging
- Testing en producción
- Monitoreo de errores

---

## 📋 ARCHIVOS DE DOCUMENTACIÓN

**Nuevos documentos:**
- ✅ `plans/cookie-migration-architecture.md` (este documento)
- ⏳ `plans/cookie-migration-implementation.md` (detalles paso a paso, crear después)

**Documentos existentes (actualizar después de implementación):**
- 🔄 `plans/auth-architecture.md` - Añadir sección de cookies
- 🔄 `plans/security-audit-report.md` - Marcar riesgos P0 como mitigados
- 🔄 `plans/login-stabilization-fix.md` - Referenciar a esta nueva arquitectura

---

## ✅ CONSIDERACIONES FINALES

### Por qué esta arquitectura es la correcta:

1. **Elimina el problema** - Fast Refresh ya no afecta (no usa estado React)
2. **Mejora seguridad** - Mitiga XSS realmente
3. **Simplifica código** - Menos lógica compleja = menos bugs
4. **Estándar** - Proven solution usado por todas las auth platforms
5. **Futuro-proof** - Compatible con SSR, Edge, etc.

### Trade-offs:

- **Migración requiere tiempo** - 2-3 días de trabajo
- **Cambios en frontend** - Requiere refactor de ApiClient y AuthContext
- **Testing necesario** - Debe probarse exhaustivamente

### Sin embargo:

- **El costo de implementar** < **Costo de mantener sistema inestable**
- **Cada día que pasa sin fix** = login roto en producción
- **Esta es la única solución** que garantiza 100% estabilidad

**Recomendación: Implementar esta arquitectura AHORA.**