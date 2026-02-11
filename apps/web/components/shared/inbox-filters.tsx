'use client';

import { translate } from '@/lib/i18n';

interface YachtOption {
  id: string;
  name: string;
}

interface InboxFiltersProps {
  yachts: YachtOption[];
  moduleValue: string;
  severityValue: string;
  daysValue: string;
  yachtValue: string;
  onYachtChange: (value: string) => void;
  onModuleChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onDaysChange: (value: string) => void;
}

export function InboxFilters({
  yachts,
  moduleValue,
  severityValue,
  daysValue,
  yachtValue,
  onYachtChange,
  onModuleChange,
  onSeverityChange,
  onDaysChange,
}: InboxFiltersProps) {
  return (
    <div className="grid gap-3 rounded border bg-white p-4 md:grid-cols-4">
      <select
        className="rounded border p-2 text-sm"
        value={yachtValue}
        onChange={(event) => onYachtChange(event.target.value)}
      >
        <option value="all-yachts">{translate('inbox.allYachts')}</option>
        {yachts.map((yacht) => (
          <option key={yacht.id} value={yacht.id}>
            {yacht.name}
          </option>
        ))}
      </select>

      <select
        className="rounded border p-2 text-sm"
        value={moduleValue}
        onChange={(event) => onModuleChange(event.target.value)}
      >
        <option value="all-modules">{translate('inbox.allModules')}</option>
        <option value="documents">{translate('timeline.documents')}</option>
        <option value="maintenance">{translate('timeline.maintenance')}</option>
        <option value="ism">{translate('timeline.ism')}</option>
        <option value="requisitions">{translate('timeline.requisitions')}</option>
      </select>

      <select
        className="rounded border p-2 text-sm"
        value={severityValue}
        onChange={(event) => onSeverityChange(event.target.value)}
      >
        <option value="all-severity">{translate('inbox.allSeverity')}</option>
        <option value="info">{translate('inbox.info')}</option>
        <option value="warn">{translate('inbox.warn')}</option>
        <option value="critical">{translate('inbox.critical')}</option>
      </select>

      <select
        className="rounded border p-2 text-sm"
        value={daysValue}
        onChange={(event) => onDaysChange(event.target.value)}
      >
        <option value="7">{translate('inbox.expiringInDays', { days: '7' })}</option>
        <option value="14">{translate('inbox.expiringInDays', { days: '14' })}</option>
        <option value="30">{translate('inbox.expiringInDays', { days: '30' })}</option>
      </select>
    </div>
  );
}
