import Link from 'next/link';

const modules = [
  { label: 'Inbox Operativo', href: '/' },
  { label: 'Log Book', href: '/logbook' },
  { label: 'PMS Maintenance', href: '#' },
  { label: 'Documents', href: '#' },
  { label: 'ISM/SMS', href: '#' },
  { label: 'Requisitions', href: '#' },
  { label: 'Guest Manifest', href: '#' },
  { label: 'Working Days', href: '#' },
  { label: 'Timeline', href: '/timeline' },
  { label: 'Notification Settings', href: '/settings/notifications' },
];

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold">Yacht PMS</h2>
      <ul className="space-y-2">
        {modules.map((item) => (
          <li key={item.label} className="rounded px-2 py-1 text-sm hover:bg-slate-100">
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
