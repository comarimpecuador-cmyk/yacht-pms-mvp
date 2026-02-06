const mockEntries = [
  { id: 'LB-001', date: '2026-02-05', watch: '08:00-12:00', status: 'Draft' },
  { id: 'LB-002', date: '2026-02-04', watch: '12:00-16:00', status: 'Submitted' },
];

export default function LogBookPage() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Log Book</h1>
        <button className="rounded border bg-white px-3 py-2 text-sm">Nueva entrada</button>
      </div>
      <div className="rounded border bg-white p-4">
        <ul className="space-y-2 text-sm">
          {mockEntries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between border-b pb-2">
              <span>
                {entry.date} · {entry.watch}
              </span>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs">{entry.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
