# 🚀 IMPLEMENTACIÓN PASO A PASO - MIGRACIÓN A COOKIES

**Fecha:** 2026-02-10  
**Estimado:** 2-3 días  
**Prioridad:** CRÍTICA - Login no funciona actualmente  

---

## 🎯 OBJETIVO

Implementar la arquitectura HTTP-Only Cookies documentada en `plans/cookie-migration-architecture.md` para estabilizar login 100%.

---

## 📋 CHECKLIST PRE-IMPLEMENTACIÓN

- [ ] Backend corriendo (port 3001)
- [ ] Frontend corriendo (port 3000)
- [ ] PostgreSQL corriendo
- [ ] Seed ejecutado (`npx prisma db seed`)
- [ ] Credenciales funcionan con `curl`:
  ```bash
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"sysadmin@yachtpms.com","password":"sysadmin123"}'
  ```

---

## ⚡ DAY 1: BACKEND IMPLEMENTATION (4-6 horas)

### Paso 1.1: Instalar dependencias (15 min)

**Directorio:** `apps/api`

```bash
npm install --save cookie-parser
npm install --save-dev @types/cookie-parser
```

**Verificar:** `apps/api/package.json` debe tener:

```json
{
  "dependencies": {
    "cookie-parser": "^1.4.6"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.6"
  }
}
```

### Paso 1.2: Configurar main.ts con cookie-parser (15 min)

**Archivo:** `apps/api/src/main.ts`

```bash
cp apps/api/src/main.ts apps/api/src/main.ts.backup
```

**Editar:**

```diff
  import { ValidationPipe } from '@nestjs/common';
  import { NestFactory } from '@nestjs/core';
  import { AppModule } from './app.module';
+ import * as cookieParser from 'cookie-parser';

  async function bootstrap() {
    const app = await NestFactory.create(AppModule);

+   // CORS - Permitir frontend
    app.enableCors({
      origin: 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    });

+   // Cookie Parser - ESSENTIAL
+   app.use(cookieParser());

    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(process.env.PORT || 4000);
  }

  bootstrap();
```

**Verificar:** Backend compila sin errores

```bash
cd apps/api
npm run build  # o tu comando de build
# Debe compilar sin errores
```

### Paso 1.3: Refactor auth.controller.ts (45 min)

**Archivo:** `apps/api/src/auth/auth.controller.ts`

```bash
cp apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.controller.ts.backup
```

**Nuevo contenido completo:**

```typescript
import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
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
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    try {
      // Lee refresh token de cookie
      const refreshToken = req.cookies.refreshToken;
      
      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token');
      }

      const newTokens = await this.authService.refresh(refreshToken);

      // Actualizar accessToken cookie
      res.cookie('accessToken', newTokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });

      return res.json({ success: true });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
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
  async getProfile(@Req() req: Request) {
    return {
      user: req.user,
    };
  }
}
```

### Paso 1.4: Refactor jwt.strategy.ts (20 min)

**Archivo:** `apps/api/src/auth/jwt.strategy.ts`

```bash
cp apps/api/src/auth/jwt.strategy.ts apps/api/src/auth/jwt.strategy.ts.backup
```

**Editar:**

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
      email: payload.email || null,
      role: payload.role,
      yachtIds: payload.yachtIds || [],
    };
  }
}
```

### Paso 1.5: Verificar backend completo (30 min)

**Test endpoints:**

```bash
# Test 1: Login con cookies
curl -i -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sysadmin@yachtpms.com","password":"sysadmin123"}' \
  -c cookies.txt  # Guardar cookies

# Verificar: Response debe tener Set-Cookie headers

# Test 2: Access endpoint con cookies
curl -i -X GET http://localhost:3001/api/auth/me \
  -b cookies.txt  # Usar cookies guardadas

# Verificar: Debe retornar usuario con role SystemAdmin

# Test 3: Logout
curl -i -X POST http://localhost:3001/api/auth/logout \
  -b cookies.txt

# Verificar: Cookies deben ser removidas
```

**Backend Day 1 completado** ✅

---

## ⚡ DAY 2: FRONTEND REFACTOR (6-8 horas)

### Paso 2.1: Refactor ApiClient (2 horas)

**Archivo:** `apps/web/lib/api.ts`

```bash
cp apps/web/lib/api.ts apps/web/lib/api.ts.backup
```

**Editar sección completa:**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export interface LoginResponse {
  success: boolean;
}

export interface ApiError {
  message?: string;
  statusCode?: number;
}

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

    // FIX: NO leer tokens de localStorage
    // FIX: NO enviar Authorization header
    // Cookies se envían automáticamente

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', // ✅ ENVÍA COOKIES AUTOMÁTICAMENTE
    });

    if (response.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request(method, endpoint, body);
      }

      if (typeof window !== 'undefined') {
        window.location.href = '/login';
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
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>('GET', endpoint);
  }

  post<T>(endpoint: string, body?: object) {
    return this.request<T>('POST', endpoint, body);
  }

  patch<T>(endpoint: string, body?: object) {
    return this.request<T>('PATCH', endpoint, body);
  }

  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

export const api = new ApiClient();

export const login = (email: string, password: string) =>
  api.post<{ success: boolean }>('/api/auth/login', { email, password });

export const refresh = () =>
  api.post<{ success: boolean }>('/api/auth/refresh', {});

export const logout = () =>
  api.post<{ success: boolean }>('/api/auth/logout', {});

export const getProfile = () =>
  api.get<{ user: { id: string; email: string; role: string; yachtIds: string[] } }>('/api/auth/me');
```

**Verificar:** Frontend compila sin errores

```bash
cd apps/web
npm run build  # o tu comando de build
```

### Paso 2.2: Refactor AuthContext (2 horas)

**Archivo:** `apps/web/lib/auth-context.tsx`

```bash
cp apps/web/lib/auth-context.tsx apps/web/lib/auth-context.tsx.backup
```

**Nuevo contenido completo:**

```typescript
'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, logout as apiLogout } from './api';

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
    <AuthContext.Provider value={{ user, isLoading, logout }}>
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

### Paso 2.3: Refactor ProtectedRoute (1 hora)

**Archivo:** `apps/web/components/auth/protected-route.tsx`

```bash
cp apps/web/components/auth/protected-route.tsx apps/web/components/auth/protected-route.tsx.backup
```

**Editar:**

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

  if (!user) {
    return null; // Redirect ocurrirá
  }

  return <>{children}</>;
}
```

### Paso 2.4: Verificar frontend completo (30 min)

**Test manual:**

1. **Abrir consola navegador** (F12)
2. **En Network tab, seleccionar "Preserve log"**
3. **Intentar login:**
   - Email: `sysadmin@yachtpms.com`
   - Password: `sysadmin123`
4. **Verificar en Network:**
   - Request a `/api/auth/login` debe enviar sin `Authorization` header
   - Response debe tener `Set-Cookie: accessToken=...; HttpOnly; Secure; SameSite=Strict; Path=/`
   - Request a `/api/auth/me` debe enviar automáticamente con `Cookie: accessToken=...` (no visible en headers, es automático)

**Frontend Day 2 completado** ✅

---

## ⚡ DAY 3: INTEGRACIÓN Y TESTING (4-6 horas)

### Paso 3.1: Test flujo completo (2 horas)

**Prueba 1: Login completo**
```bash
curl -i -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sysadmin@yachtpms.com","password":"sysadmin123"}' \
  -c cookies.txt

# Verificar: Set-Cookie headers presentes
```

**Prueba 2: Frontend conectando**
1. Abrir http://localhost:3000
2. Login normal
3. Verificar en Network tab:
   - Login request sin Authorization header
   - Me request envía cookie automáticamente
   - Response devuelve user data

### Paso 3.2: Test refresh flow (1 hora)

```typescript
// Manual testing:
// 1. Login
// 2. Esperar 16 minutos (o cambiar JWT_ACCESS_EXPIRES_IN a 30s para testing)
// 3. Hacer click a cualquier página
// 4. Verificar en Network: automáticamente llama /api/auth/refresh
// 5. Verifica que funciona sin 401
```

### Paso 3.3: Test logout (30 min)

1. Login
2. Click logout
3. Verificar:
   - Cookies cleared
   - Redirect a /login

### Paso 3.4: QA Manual Completo (1 hora)

**Usuarios de prueba:**
- `sysadmin@yachtpms.com` / `sysadmin123` (SystemAdmin)
- `admin@yachtpms.com` / `admin123` (Admin)
- `captain@yachtpms.com` / `captain123` (Captain)

**Test cases:**
- [ ] Cada usuario puede login
- [ ] Cada usuario ve correctos yachtIds
- [ ] Refresh funciona (token expira y se refresh automático)
- [ ] Logout funciona
- [ ] Logout e intentar acceder a página protegida → redirect a login
- [ ] Login, cerrar browser, abrir de nuevo → sigue autenticado (session cookie)

---

## 📦 DEPLOY Y MONITORING

### Pre-deploy checklist:
- [ ] Backend y Frontend funcionan localmente
- [ ] Todos los tests pasan
- [ ] Variables de entorno configuradas en producción
- [ ] BASE_URL para frontend apunta a backend
- [ ] HTTPS enabled en producción
- [ ] CORS origin seteado a dominio real
- [ ] JWT secrets configurados

### Post-deploy:
- [ ] Test login en staging/producción
- [ ] Monitoreo de errores de auth
- [ ] Track tokens expirados vs refresh success rate
- [ ] Alertas para múltiples 401
```

**Día 3 completado** ✅

---

## 📋 ARCHIVOS MODIFICADOS

**Backend:**
- `apps/api/src/main.ts` (CORS + cookieParser)
- `apps/api/src/auth/auth.controller.ts` (cambio completo)
- `apps/api/src/auth/jwt.strategy.ts` (leer de cookies)

**Frontend:**
- `apps/web/lib/api.ts` (NO leer tokens, credentials: 'include')
- `apps/web/lib/auth-context.tsx` (NO localStorage, solo UI state)
- `apps/web/components/auth/protected-route.tsx` (simplificado)

**Dependencias:**
- `apps/api/package.json` (+ cookie-parser)

**Total:** 6 archivos modificados

---

## 🚨 TROUBLESHOOTING

### Error: "Cannot read property 'cookies' of undefined"
**Solución:** Asegurar que `cookie-parser` está instalado y `app.use(cookieParser())` está antes de routes

### Error: CORS con cookies
**Solución:** Verificar `app.enableCors({ credentials: true, origin: 'http://localhost:3000' })`

### Error: Frontend no envía cookies
**Solución:** Verificar `credentials: 'include'` en TODOS los fetch

### Error: ProtectedRoute loop
**Solución:** Asegurar que backend envía cookies correctamente y frontend no usa localStorage

---

## ✅ SUCCESS CRITERIA

Criterios de aceptación:

- [ ] Login funciona con cualquier usuario
- [ ] Refresh automático funciona (sin errors 401)
- [ ] No más redirect infinito
- [ ] No más Fast Refresh issues
- [ ] Tokens no visibles en JavaScript (httpOnly)
- [ ] SystemAdmin mantiene acceso después de refresh
- [ ] Multi-yacht funciona
- [ ] Logout funciona
- [ ] CI/CD pipeline pasa
- [ ] QA manual completo pasa

**Cuando todos los criterios están marcados, la migración está completa.**
