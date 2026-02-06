const events = [
  { when: '2026-02-10', module: 'Documents', title: 'Crew cert expires', window: '7d' },
  { when: '2026-02-14', module: 'Maintenance', title: 'Generator task due', window: '14d' },
  { when: '2026-02-28', module: 'ISM', title: 'Procedure sign-off', window: '30d' },
];

export default function TimelinePage() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timeline / Agenda por Yacht</h1>
        <button className="rounded border bg-white px-3 py-2 text-sm">Export CSV</button>
      </div>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={`${event.when}-${event.title}`} className="rounded border bg-white p-4 text-sm">
            <strong>{event.when}</strong> · {event.module} · {event.title} · ventana {event.window}
          </li>
        ))}
      </ul>
    </section>
  );
}
