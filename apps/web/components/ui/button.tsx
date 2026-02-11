import * as React from 'react';
import { cn } from '@/lib/utils';

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn('rounded bg-slate-900 px-3 py-2 text-sm text-white', className)}
      {...props}
    />
  );
}
