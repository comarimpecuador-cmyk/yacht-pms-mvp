# 🔍 Auditoría de Bugs - Login / Redirect Loops

## Bug 1: POST /api/auth/login disparado al teclear
### Bug 2: Loop de navegación /login ↔ /

---

## A) Evidencia de Causas Encontradas

### Bug 1: Submit al Teclear

#### Causa #1 - Enter key en form standard HTML
**Archivo:** [`apps/web/app/(auth)/login/page.tsx:66`](apps/web/app/(auth)/login/page.tsx:66)

```tsx
<form onSubmit={handleSubmit} className="space-y-4">
```

El form usa `<form onSubmit={handleSubmit}>` sin configuración especial. Esto significa:
- Presionar **Enter** en cualquier input dispara `handleSubmit`
- Comportamiento **estándar** de HTML forms

**Evidencia:** El form tiene 2 inputs (`email` y `password`) → Enter en cualquiera envía el form.

#### Causa #2 - Estado `submittedRef` podría resetearse
**Archivo:** [`apps/web/app/(auth)/login/page.tsx:12`](apps/web/app/(auth)/login/page.tsx:12)

```tsx
const submittedRef = useRef(false);
```

**Problema:** Si hay re-renders del componente antes de completar el login, el ref podría no prevenir múltiples submits correctamente. Sin embargo, el ref **no se resetea** en re-renders normales.

#### Causa #3 - Console logs excesivos causando efectos secundarios
**Archivo:** [`apps/web/app/(auth)/login/page.tsx:15-24`](apps/web/app/(auth)/login/page.tsx:15-24)

```tsx
console.log('LOGIN render - token:', !!token, ...);
useEffect(() => {
  console.log('LOGIN effect - token:', ...);
  if (token && !isLoading && submittedRef.current) {
    console.log('LOGIN redirecting to / NOW!');
    submittedRef.current = false;
    window.location.href = '/';  // ⚠️ PROBLEMA
  }
}, [token, isLoading]);
```

**Evidencia:** El `useEffect` tiene `[token, isLoading]` como deps, lo que causa re-ejecución en cada cambio.

---

### Bug 2: Loop de Navegación

#### Causa #1 - window.location.href en lugar de router
**Archivo:** [`apps/web/app/(auth)/login/page.tsx:24`](apps/web/app/(auth)/login/page.tsx:24)

```tsx
window.location.href = '/';  // ⚠️ NAVEGACIÓN COMPLETA
```

**Problema:** `window.location.href` causa:
1. Page reload completo (no hydration de Next.js)
2. Todos los efectos se ejecutan de nuevo desde cero
3. AuthContext bootstrap se ejecuta de nuevo
4. Possible loop si algo falla durante el reload

#### Causa #2 - ProtectedRoute sin validación de expiración
**Archivo:** [`apps/web/components/auth/protected-route.tsx:20-27`](apps/web/components/auth/protected-route.tsx:20-27)

```tsx
if (!token) {
  initialized.current = true;
  router.replace('/login');  // Redirige a /login
}
```

**Problema:** El ProtectedRoute solo verifica `!token` pero NO verifica:
- Si el token está **expirado**
- Si el token es **válido** (puede estar corrupto en localStorage)

**Evidencia:** [`apps/web/lib/auth-context.tsx:98-121`](apps/web/lib/auth-context.tsx:98-121) - El bootstrap restaura token de localStorage sin validar expiración.

#### Causa #3 - AuthContext bootstrap sin validación
**Archivo:** [`apps/web/lib/auth-context.tsx:98-121`](apps/web/lib/auth-context.tsx:98-121)

```tsx
useEffect(() => {
  const storedToken = localStorage.getItem('accessToken');
  const storedUser = localStorage.getItem('user');

  if (storedToken && storedUser) {
    setToken(storedToken);
    setUser(JSON.parse(storedUser));
    // ⚠️ NO VERIFICA: ¿Token expirado?
    // ⚠️ NO VERIFICA: ¿Token válido?
  }
}, []);
```

**Problema:** El token corrupto o expirado se restaura como "válido", causando:
1. ProtectedRoute permite acceso
2. API calls fallan con 401
3. Refresh automático podría fallar
4. Loop de redirect

#### Causa #4 - Efectos en cascade en Dashboard
**Archivo:** [`apps/web/app/(protected)/page.tsx:16-23`](apps/web/app/(protected)/page.tsx:16-23)

```tsx
useEffect(() => {
  if (!authLoading && user && !initialized) {
    loadYachts().then(() => {
      setInitialized(true);
    });
  }
}, [authLoading, user, initialized]);

useEffect(() => {
  if (initialized && !yachtLoading && yachts.length === 1 && !autoSelectDone.current) {
    autoSelectDone.current = true;
    selectYacht(yachts[0].id);
  }
}, [initialized, yachtLoading, yachts, ...]);
```

**Problema:** 
- `loadYachts()` hace API call que podría fallar si token expirado
- Si falla, `initialized` podría no setearse correctamente
- `selectYacht()` usa `window.location.href` ([`yacht-context.tsx:80-82`](apps/web/lib/yacht-context.tsx:80-82))

---

## B) Diagnóstico - Causa #1 Más Probable

### **PRIMARY: window.location.href en login/page.tsx**

**Archivo:** [`apps/web/app/(auth)/login/page.tsx:24`](apps/web/app/(auth)/login/page.tsx:24)

```tsx
window.location.href = '/';
```

**Por qué es la causa #1:**

1. **Navegación completa vs parcial:**
   - `window.location.href` fuerza reload de página
   - Causa re-ejecución de TODOS los efectos
   - AuthContext bootstrap corre de nuevo

2. **Ciclo infinito posible:**
   - User loguea → redirect con `window.location.href` → page reload
   - Durante reload: AuthContext restaura token
   - Si algo falla en el reload → redirect nuevo
   - de → **Loop**

3. **No usa router de Next.js:**
   - `router.replace('/')` es navegación client-side
   - Mantiene estado de React
   - Evita reload completo

### **SECONDARY: ProtectedRoute sin validación de token expirado**

**Archivo:** [`apps/web/components/auth/protected-route.tsx`](apps/web/components/auth/protected-route.tsx)

**Por qué contribuye:**
1. Token expirado se trata como "válido"
2. API calls fallan con 401
3. Refresh automático podría no ejecutarse correctamente
4. User queda en estado inconsistente

---

## C) Plan Mínimo de Fix (3 cambios)

### FIX #1: Cambiar window.location.href a router.replace()

**Archivo:** [`apps/web/app/(auth)/login/page.tsx:24`](apps/web/app/(auth)/login/page.tsx:24)

```tsx
// ❌ ANTES
window.location.href = '/';

// ✅ DESPUÉS
router.replace('/');
```

**Línea completa:**
```tsx
useEffect(() => {
  if (token && !isLoading && submittedRef.current) {
    submittedRef.current = false;
    router.replace('/');  // ← Solo este cambio
  }
}, [token, isLoading, router]);  // ← Agregar router a deps
```

**Impacto:**
- Elimina page reload completo
- Usa navegación client-side de Next.js
- Mantiene estado de React

---

### FIX #2: Agregar validación de token expirado en ProtectedRoute

**Archivo:** [`apps/web/components/auth/protected-route.tsx`](apps/web/components/auth/protected-route.tsx)

```tsx
// ❌ ANTES
useEffect(() => {
  if (isLoading || initialized.current) return;

  if (!token) {
    initialized.current = true;
    router.replace('/login');
  }
}, [token, isLoading, router]);

// ✅ DESPUÉS
function isTokenExpired(token: string): boolean {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    const payload = JSON.parse(jsonPayload);
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch {
    return true; // Token corrupto = expirado
  }
}

useEffect(() => {
  if (isLoading || initialized.current) return;

  if (!token || isTokenExpired(token)) {
    initialized.current = true;
    router.replace('/login');
  }
}, [token, isLoading, router]);
```

**Impacto:**
- Previene acceso con token expirado
- Evita 401 loops
- Redirige inmediatamente si token corrupto

---

### FIX #3: Agregar validación de token expirado en AuthContext bootstrap

**Archivo:** [`apps/web/lib/auth-context.tsx:98-121`](apps/web/lib/auth-context.tsx:98-121)

```tsx
// ❌ ANTES
useEffect(() => {
  const storedToken = localStorage.getItem('accessToken');
  const storedUser = localStorage.getItem('user');

  if (storedToken && storedUser) {
    setToken(storedToken);
    setUser(JSON.parse(storedUser));
  }
}, []);

// ✅ DESPUÉS
useEffect(() => {
  const storedToken = localStorage.getItem('accessToken');
  const storedUser = localStorage.getItem('user');

  if (storedToken && storedUser) {
    // Verificar si token expirado
    if (isTokenExpired(storedToken)) {
      // Token expirado, limpiar y no restaurar
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      setIsLoading(false);
      return;
    }
    
    setToken(storedToken);
    setUser(JSON.parse(storedUser));
  }
  
  setIsLoading(false);
}, []);
```

**Impacto:**
- Evita restaurar tokens expirados
- Limpia localStorage de tokens inválidos
- Reduce 401 errors

---

## D) Checklist de Validación

### Network Tab
- [ ] No hay POST repetidos a `/api/auth/login` al teclear
- [ ] Login solo hace 1 request después de submit
- [ ] Redirect usa código 302 → 200 (no page reload)

### Console
- [ ] No hay errores de "Maximum update depth exceeded"
- [ ] No hay loops de redirect
- [ ] AuthContext bootstrap solo se ejecuta 1 vez por page load

### User Flow
1. **Ir a /login**
   - [ ] Ver página de login limpia
   - [ ] No auto-submit al teclear email
   - [ ] No auto-submit al teclear password

2. **Login exitoso**
   - [ ] Click "Sign In" → loading → redirect
   - [ ] Redirect a / en ~1 segundo
   - [ ] No page reload visible

3. **Con token expirado en localStorage**
   - [ ] Ir a /dashboard
   - [ ] Redirect automático a /login
   - [ ] No errores en console

4. **Logout**
   - [ ] Click logout → redirect a /login
   - [ ] Token removido de localStorage
   - [ ] No hay sesión persistente incorrecta

---

## 📁 Resumen de Archivos a Modificar

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| [`apps/web/app/(auth)/login/page.tsx`](apps/web/app/(auth)/login/page.tsx) | `window.location.href` → `router.replace()` | 🔴 Alta |
| [`apps/web/components/auth/protected-route.tsx`](apps/web/components/auth/protected-route.tsx) | Validar token expirado | 🔴 Alta |
| [`apps/web/lib/auth-context.tsx`](apps/web/lib/auth-context.tsx) | Validar token en bootstrap | 🟡 Media |

---

## ✅ Validación Post-Fix

```bash
# 1. Limpiar localStorage
localStorage.clear()

# 2. Ir a /login
# 3. Teclear en email → NO debe haber POST en Network

# 4. Login normal
# 5. Verificar redirect suave a /

# 6. En /dashboard, modificar token en localStorage (hacerlo expirar)
# 7. Refrescar página
# 8. Debe redirigir a /login sin errores
```
