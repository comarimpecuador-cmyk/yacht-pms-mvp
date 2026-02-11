# Inventory + Purchase Orders Rollout

## Alcance implementado
- Inventario por yate:
  - `InventoryItem` + `InventoryMovement`.
  - Entradas, salidas, ajustes y transferencias.
  - Alertas y notificaciones para `low_stock` y `stockout`.
- Ordenes de compra por yate:
  - `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderReceipt`, `PurchaseOrderReceiptLine`, `PurchaseOrderAttachment`.
  - Flujo: `draft -> submitted -> approved -> ordered -> partially_received -> received/cancelled`.
  - Recepcion de PO actualiza inventario con movimientos `in`.
- Integraciones:
  - Dashboard del yate (`/yachts/:id/home`) con KPIs nuevos.
  - Actividad reciente del yate (items `inventory` y `purchase_order`).
  - Agenda/timeline (`/timeline`) con entregas esperadas de PO.
  - Notificaciones in-app en espanol.
  - `AuditEvent` para acciones de inventario y PO.

## Migracion
- Migration Prisma:
  - `apps/api/prisma/migrations/20260211235900_inventory_purchase_modules/migration.sql`
- Aplicar en entorno:
```bash
pnpm --filter @yacht-pms/api exec prisma migrate deploy
```

## Endpoints

### Inventory
- `GET /api/inventory/status`
- `GET /api/yachts/:yachtId/inventory/items?search&category&lowStock&page&pageSize`
- `POST /api/yachts/:yachtId/inventory/items`
- `GET /api/inventory/items/:id`
- `PATCH /api/inventory/items/:id`
- `POST /api/inventory/items/:id/movements`
- `GET /api/yachts/:yachtId/inventory/movements?itemId&type&from&to&page&pageSize`

### Purchase Orders
- `GET /api/purchase-orders/status`
- `GET /api/yachts/:yachtId/purchase-orders?status&vendor&from&to&page&pageSize`
- `POST /api/yachts/:yachtId/purchase-orders`
- `GET /api/purchase-orders/:id`
- `PATCH /api/purchase-orders/:id`
- `POST /api/purchase-orders/:id/submit`
- `POST /api/purchase-orders/:id/approve`
- `POST /api/purchase-orders/:id/mark-ordered`
- `POST /api/purchase-orders/:id/receive`
- `POST /api/purchase-orders/:id/cancel`
- `POST /api/purchase-orders/:id/add-document`

## Roles (resumen)
- Ver inventario/PO: `Crew Member`, `HoD`, `Chief Engineer`, `Captain`, `Management/Office`, `Admin`, `SystemAdmin`.
- Crear/editar PO draft-submitted: `Crew Member`, `Chief Engineer`, `Captain`, `Management/Office`, `Admin`, `SystemAdmin`.
- Aprobar PO: `Captain`, `Admin`, `SystemAdmin`.
- Marcar emitida/cancelar PO: `Chief Engineer`, `Captain`, `Management/Office`, `Admin`, `SystemAdmin`.
- Recepcionar PO: `Chief Engineer`, `Captain`, `Admin`, `SystemAdmin`.
- Ajustes de inventario: `Chief Engineer`, `Captain`, `Admin`, `SystemAdmin`.

## Reglas de negocio
- Cantidades siempre `> 0`.
- `reason` obligatorio para movimientos y cambios de estado.
- No se puede editar PO fuera de `draft/submitted` (salvo Admin/SystemAdmin).
- Recepcion no puede exceder cantidad pendiente por linea.
- Recepcion parcial mueve estado a `partially_received`; total a `received`.
- Recepciones con `itemId` crean `InventoryMovement` tipo `in`.

## KPIs de dashboard del yate
- `inventoryLowStockCount`
- `purchaseOrdersPendingApprovalCount`
- `purchaseOrdersOpenCount`

## Smoke test
1. Crear item inventario con `minStock=5` y `currentStock=5`.
2. Registrar salida `qty=1`: debe quedar `4` y generar low-stock + actividad.
3. Crear PO draft con una linea `itemId`.
4. Submit PO: notificacion a aprobadores.
5. Approve PO.
6. Mark ordered.
7. Receive parcial y luego final:
   - Debe crear movimientos `in`.
   - Estado debe pasar por `partially_received` y luego `received`.
8. Verificar:
   - Home del yate con KPIs actualizados.
   - Actividad reciente con items de inventario/PO.
   - Timeline con entrega esperada PO cuando aplica.
