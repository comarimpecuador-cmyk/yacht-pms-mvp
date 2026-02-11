import { StatusBadge } from './status-badge';
import { translate } from '@/lib/i18n';

type Severity = 'info' | 'warn' | 'critical';

interface InboxSection {
  titleKey: string;
  items: string[];
  severity: Severity;
}

interface InboxSectionsProps {
  sections: InboxSection[];
}

export function InboxSections({ sections }: InboxSectionsProps) {
  if (sections.length === 0) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-slate-500">
        Sin elementos en bandeja para mostrar.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => (
        <div key={section.titleKey} className="rounded border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{translate(section.titleKey)}</h3>
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
