export default function NotificationSettingsPage() {
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Notification Settings</h1>
      <div className="rounded border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Email por tipo</label>
          <select className="rounded border p-2 text-sm">
            <option>ON</option>
            <option>OFF</option>
          </select>
          <label className="text-sm">Ventana horaria</label>
          <input className="rounded border p-2 text-sm" defaultValue="08:00-18:00" />
          <label className="text-sm">Yachts scope</label>
          <input className="rounded border p-2 text-sm" defaultValue="Yacht A, Yacht B" />
          <label className="text-sm">Severidad mínima</label>
          <select className="rounded border p-2 text-sm">
            <option>info</option>
            <option>warn</option>
            <option>critical</option>
          </select>
        </div>
      </div>
    </section>
  );
}
