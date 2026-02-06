export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {status}
    </span>
  );
}
