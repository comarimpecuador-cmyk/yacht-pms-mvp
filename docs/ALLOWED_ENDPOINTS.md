# Allowed Endpoints (v2.0)

## Descripción
Documento autoritativo de endpoints que la UI puede consumir. Cualquier endpoint no listado aquí debe ser removido de la UI o agregado explícitamente.

---

## Auth
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login con email/password |
| POST | `/api/auth/refresh` | Refresh token JWT |

---

## Yachts
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/yachts` | Listar yachts visibles para el usuario |
| POST | `/api/yachts` | Crear nuevo yacht |
| GET | `/api/yachts/:id/access` | Listar accesos del yacht |
| POST | `/api/yachts/:id/access` | Grant access a usuario |
| PATCH | `/api/yachts/:id/access/:uid` | Update access/role |

---

## Engines
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/engines?yachtId=` | Listar motores por yacht |
| POST | `/api/engines` | Crear motor |
| DELETE | `/api/engines/:id` | Eliminar motor |

---

## Logbook Entries
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/logbook/entries?yachtId=` | Listar entradas por yacht |
| POST | `/api/logbook/entries` | Crear entrada |
| POST | `/api/logbook/entries/:id/lock` | Lock entrada |

---

## Users
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/users/by-email` | Obtener usuario por email |

---

## Dashboard (Stats)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/alerts/:yachtId` | Listar alertas por yacht |
| GET | `/api/maintenance/status` | Status de mantenimiento |

---

## Historial de Versiones

| Versión | Fecha | Cambios |
|---------|-------|---------|
| v2.0 | 2026-02-09 | Expandido para cubrir endpoints de dashboard, users, alerts, maintenance |
| v1.0 | - | Versión inicial |

---

## Notas

- Todos los endpoints requieren autenticación JWT válida
- Los parámetros de path (`:id`, `:uid`, `:yachtId`) deben ser validados
- Los queries params (`yachtId=`) deben ser sanitizados
