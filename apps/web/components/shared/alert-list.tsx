import { translate } from '@/lib/i18n';

const alerts = [
  'Certificate of registry vence en 14 días',
  'Crew license vence en 7 días',
  'Mantenimiento de generador vencido',
];

export function AlertList() {
  return (
    <div className="rounded border bg-white p-4">
      <h3 className="mb-3 font-semibold">{translate('alerts.title')}</h3>
      <ul className="list-disc space-y-1 pl-6 text-sm">
        {alerts.map((alert) => (
          <li key={alert}>{alert}</li>
        ))}
      </ul>
    </div>
  );
}
