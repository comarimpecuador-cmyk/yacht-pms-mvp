'use client';

type StatusType = 'Draft' | 'Submitted' | 'Locked' | 'Corrected';

interface StatusBadgeProps {
  status: string | StatusType;
  size?: 'sm' | 'md';
}

const statusColors: Record<StatusType, string> = {
  Draft: 'bg-amber-100 text-amber-800 border-amber-200',
  Submitted: 'bg-blue-100 text-blue-800 border-blue-200',
  Locked: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Corrected: 'bg-orange-100 text-orange-800 border-orange-200',
};

const statusLabels: Record<StatusType, string> = {
  Draft: 'Borrador',
  Submitted: 'Enviado',
  Locked: 'Bloqueado',
  Corrected: 'Corregido',
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const normalizedStatus = (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()) as StatusType;
  const colorClass = statusColors[normalizedStatus] || statusColors.Draft;
  const label = statusLabels[normalizedStatus] || normalizedStatus;
  
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${colorClass} ${padding}`}>
      {label}
    </span>
  );
}
