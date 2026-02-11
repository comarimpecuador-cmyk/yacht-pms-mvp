import { StatusBadge } from './status-badge';
import { translate } from '@/lib/i18n';

const approvals = [
  { id: 'REQ-001', title: 'Oil filter kit', status: 'Under Captain Review' },
  { id: 'REQ-002', title: 'Safety drill vendor', status: 'Under Management Review' },
];

export function ApprovalList() {
  return (
    <div className="rounded border bg-white p-4">
      <h3 className="mb-3 font-semibold">{translate('approvals.title')}</h3>
      <ul className="space-y-2">
        {approvals.map((item) => (
          <li key={item.id} className="flex items-center justify-between">
            <span>{item.id} - {item.title}</span>
            <StatusBadge status={item.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
