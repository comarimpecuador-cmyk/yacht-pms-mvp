export function InboxFilters() {
  return (
    <div className="grid gap-3 rounded border bg-white p-4 md:grid-cols-4">
      <select className="rounded border p-2 text-sm" defaultValue="all-yachts">
        <option value="all-yachts">Yacht: Todos</option>
        <option value="y1">Yacht A</option>
      </select>
      <select className="rounded border p-2 text-sm" defaultValue="all-modules">
        <option value="all-modules">Módulo: Todos</option>
        <option value="documents">Documents</option>
        <option value="maintenance">Maintenance</option>
        <option value="ism">ISM</option>
        <option value="requisitions">Requisitions</option>
      </select>
      <select className="rounded border p-2 text-sm" defaultValue="all-severity">
        <option value="all-severity">Severidad: Todas</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="critical">Critical</option>
      </select>
      <select className="rounded border p-2 text-sm" defaultValue="7">
        <option value="7">Vencen en 7 días</option>
        <option value="14">Vencen en 14 días</option>
        <option value="30">Vencen en 30 días</option>
      </select>
    </div>
  );
}
