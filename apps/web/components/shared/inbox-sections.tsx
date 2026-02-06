import { StatusBadge } from './status-badge';

const sections = [
  { title: 'Approvals', items: ['REQ-221 pending Captain', 'REQ-244 pending Management'], severity: 'warn' },
  { title: 'Expirations', items: ['Crew license in 3 days', 'Yacht permit in 14 days'], severity: 'critical' },
  { title: 'Due Tasks', items: ['Generator service overdue', 'Engine check due today'], severity: 'warn' },
  { title: 'ISM Pending', items: ['Drill form pending signature'], severity: 'info' },
];

export function InboxSections() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => (
        <div key={section.title} className="rounded border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{section.title}</h3>
            <StatusBadge status={section.severity} />
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
