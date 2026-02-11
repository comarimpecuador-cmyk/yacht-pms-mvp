# PMS Yacht Platform - Browser Test Checklist

## Configuración de Pruebas

| Campo | Valor |
|-------|-------|
| URL | http://localhost:3000 |
| API URL | http://localhost:3001 |
| Navegador | Chrome/Firefox (última versión) |
| Usuario Admin | admin@yachtpms.com / admin123 |
| Usuario Captain | captain@yachtpms.com / captain123 |
| Usuario SystemAdmin | sysadmin@yachtpms.com / sysadmin123 |

---

## 1. Autenticación

### 1.1 Login - Usuario Válido
- [ ] Ir a http://localhost:3000/login
- [ ] Ingresar email: `admin@yachtpms.com`
- [ ] Ingresar password: `admin123`
- [ ] Click en "Iniciar Sesión"
- [ ] Verificar que redirige al dashboard
- [ ] **Esperado:** Dashboard carga correctamente

### 1.2 Login - Usuario Inválido
- [ ] Ir a http://localhost:3000/login
- [ ] Ingresar email: `invalid@test.com`
- [ ] Ingresar password: `wrongpassword`
- [ ] Click en "Iniciar Sesión"
- [ ] **Esperado:** Mensaje de error "Credenciales inválidas"

### 1.3 Logout
- [ ] Click en menú de usuario (esquina superior derecha)
- [ ] Click en "Cerrar Sesión"
- [ ] **Esperado:** Redirige a /login

---

## 2. Dashboard - Selector de Yachts

### 2.1 Cargar Yachts
- [ ] Login como `admin@yachtpms.com`
- [ ] Verificar que muestra lista de yachts
- [ ] **Esperado:** Tarjetas con nombre, bandera, capitán asignado

### 2.2 Seleccionar Yacht
- [ ] Click en un yacht (ej: "M/Y Esperanza")
- [ ] Verificar que carga la página del yacht
- [ ] **Esperado:** URL cambia a `/yachts/[id]/home`

### 2.3 Sin Yachts Asignados (403)
- [ ] Login como usuario sin yachts asignados
- [ ] Ver dashboard
- [ ] **Esperado:** Mensaje "No tienes acceso a ningún yacht"

---

## 3. Home del Yacht

### 3.1 Cargar Home
- [ ] Estar en `/yachts/[id]/home`
- [ ] Verificar que muestra:
  - [ ] Nombre del yacht
  - [ ] Bandera
  - [ ] Capitán asignado
  - [ ] Resumen de notificaciones
- [ ] **Esperado:** Toda la información visible

### 3.2 Menú de Navegación
- [ ] Ver sidebar izquierdo
- [ ] Click en cada opción:
  - [ ] "Crew" → carga correctamente
  - [ ] "Motores" → carga correctamente
  - [ ] "Logbook" → carga correctamente
  - [ ] "Mantenimiento" → carga correctamente
  - [ ] "Timeline" → carga correctamente
- [ ] **Esperado:** Todas las páginas cargan sin errores

---

## 4. Crew Management

### 4.1 Cargar Crew
- [ ] Ir a `/yachts/[id]/crew`
- [ ] Verificar lista de crew members
- [ ] **Esperado:** Tabla con columnas: Nombre, Email, Rol, Estado

### 4.2 Agregar Usuario
- [ ] Click en "Agregar Usuario"
- [ ] Ingresar email: `newcrew@test.com`
- [ ] Seleccionar rol: "Engineer"
- [ ] Click en "Agregar"
- [ ] **Esperado:** Usuario aparece en la lista

### 4.3 Editar Rol
- [ ] Click en editar (ícono de lápiz) en un usuario
- [ ] Cambiar rol a "Captain"
- [ ] Click en "Guardar"
- [ ] **Esperado:** Rol actualizado en la tabla

---

## 5. Engines (Motores)

### 5.1 Cargar Engines
- [ ] Ir a `/yachts/[id]/engines` o `/engines`
- [ ] Verificar lista de motores
- [ ] **Esperado:** Tarjetas con nombre, tipo, horas, estado

### 5.2 Agregar Engine
- [ ] Click en "Agregar Motor"
- [ ] Llenar formulario:
  - Nombre: "Motor Principal"
  - Tipo: "Diesel"
  - Horas: 1500
- [ ] Click en "Guardar"
- [ ] **Esperado:** Motor aparece en la lista

### 5.3 Engine Error - Sin Acceso
- [ ] Login como usuario sin acceso al yacht
- [ ] Intentar acceder a `/engines?yachtId=[id]`
- [ ] **Esperado:** Pantalla "No tienes acceso a este yacht" + "Volver al selector"

### 5.4 Engine Error - Red (No Bloqueante)
- [ ] Simular error de red
- [ ] Verificar que muestra "Motores no disponibles"
- [ ] **Esperado:** UI no se bloquea, mensaje en español

---

## 6. Logbook (Cuaderno de Bitácora)

### 6.1 Cargar Logbook
- [ ] Ir a `/yachts/[id]/logbook`
- [ ] Verificar tabla de entradas
- [ ] **Esperado:** Lista de entradas con fecha, autor, tipo

### 6.2 Crear Entrada
- [ ] Click en "Agregar Entrada"
- [ ] Llenar campos:
  - Tipo: "Operación"
  - Descripción: "Prueba de logbook"
- [ ] Click en "Guardar"
- [ ] **Esperado:** Entrada aparece en la tabla

### 6.3 Lock Entry
- [ ] Click en candado en una entrada
- [ ] **Esperado:** Entrada marcada como bloqueada

### 6.4 Logbook 401 - Token Expirado
- [ ] Dejar token expirar
- [ ] Refrescar página
- [ ] **Esperado:** Redirect a /login

### 6.5 Logbook 403 - Sin Acceso
- [ ] Login como usuario sin acceso al yacht
- [ ] Intentar acceder a `/logbook`
- [ ] **Esperado:** Pantalla "No tienes acceso a este yacht"

---

## 7. Mantenimiento

### 7.1 Cargar Mantenimiento
- [ ] Ir a `/maintenance`
- [ ] Ver lista de tareas
- [ ] **Esperado:** Tabla con equipos, fechas, estados

### 7.2 Crear Tarea
- [ ] Click en "Agregar Tarea"
- [ ] Llenar formulario
- [ ] **Esperado:** Tarea aparece en lista

---

## 8. Timeline (Agenda)

### 8.1 Cargar Timeline
- [ ] Ir a `/timeline`
- [ ] Ver eventos por fecha
- [ ] **Esperado:** Calendario/lista de eventos

### 8.2 Exportar CSV
- [ ] Click en "Exportar CSV"
- [ ] **Esperado:** Descarga archivo CSV

---

## 9. Notificaciones

### 9.1 Ver Notificaciones
- [ ] Click en campana (esquina superior derecha)
- [ ] Ver lista de notificaciones
- [ ] **Esperado:** Notificaciones visibles

### 9.2 Settings
- [ ] Ir a `/settings/notifications`
- [ ] Ver opciones de configuración
- [ ] **Esperado:** Formulario carga correctamente

---

## 10. Seguridad y Permisos

### 10.1 SystemAdmin Bypass
- [ ] Login como `sysadmin@yachtpms.com`
- [ ] Acceder a yacht sin UserYachtAccess
- [ ] **Esperado:** Acceso permitido (bypass)

### 10.2 Admin Sin Acceso
- [ ] Login como `admin@yachtpms.com`
- [ ] Intentar acceder a yacht sin UserYachtAccess
- [ ] **Esperado:** 403 Forbidden

### 10.3 Captain Sin YachtId
- [ ] Login como `captain@yachtpms.com`
- [ ] Intentar endpoint sin yachtId
- [ ] **Esperado:** 400 Bad Request

### 10.4 Token Inválido (401)
- [ ] Usar token inválido en API
- [ ] **Esperado:** 401 Unauthorized

---

## 11. i18n - Verificar Español

### 11.1 Verificar UI en Español
- [ ] Revisar que TODOS los textos están en español:
  - [ ] Botones: "Guardar", "Cancelar", "Agregar", "Editar", "Eliminar"
  - [ ] Títulos: "Crew", "Motores", "Logbook", "Mantenimiento", "Timeline"
  - [ ] Mensajes: "Cargando...", "Error", "Éxito"
  - [ ] Labels: "Email", "Password", "Nombre", "Rol"
- [ ] **Esperado:** Ningún texto en inglés visible

### 11.2 Verificar Console Logs
- [ ] Abrir DevTools (F12)
- [ ] Verificar que no hay errores en español
- [ ] **Esperado:** Console limpio de strings en inglés

---

## 12. Responsive Design

### 12.1 Desktop (1920x1080)
- [ ] Verificar layout completo
- [ ] **Esperado:** Sidebar visible, contenido completo

### 12.2 Laptop (1366x768)
- [ ] Verificar layout
- [ ] **Esperado:** Contenido visible sin scroll horizontal

### 12.3 Tablet (768x1024)
- [ ] Verificar layout
- [ ] **Esperado:** Sidebar colapsable

### 12.4 Mobile (375x667)
- [ ] Verificar layout
- [ ] **Esperado:** Menú hamburguesa visible

---

## 13. Rendimiento

### 13.1 Carga de Página
- [ ] Medir tiempo de carga inicial
- [ ] **Esperado:** < 3 segundos

### 13.2 Transiciones
- [ ] Navegar entre páginas
- [ ] **Esperado:** Transiciones suaves, sin parpadeo

---

## Bugs Conocidos

| Bug | Descripción | Trabajo Alrededor |
|-----|-------------|-------------------|
| ... | ... | ... |

---

## Notas de Prueba

| Fecha | Tester | Notas |
|-------|--------|-------|
| ... | ... | ... |

---

## Estado Final

| Sección | Tests Pasados | Tests Fallidos | Porcentaje |
|---------|---------------|----------------|------------|
| 1. Autenticación | / | / | % |
| 2. Dashboard | / | / | % |
| 3. Home | / | / | % |
| 4. Crew | / | / | % |
| 5. Engines | / | / | % |
| 6. Logbook | / | / | % |
| 7. Mantenimiento | / | / | % |
| 8. Timeline | / | / | % |
| 9. Notificaciones | / | / | % |
| 10. Seguridad | / | / | % |
| 11. i18n | / | / | % |
| 12. Responsive | / | / | % |
| **TOTAL** | / | / | % |

---

## Firmas

| Rol | Nombre | Fecha |
|-----|--------|-------|
| Tester | | |
| Developer | | |
| Product Owner | | |
