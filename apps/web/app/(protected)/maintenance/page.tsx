'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useYacht } from '@/lib/yacht-context';
import { translate } from '@/lib/i18n';

export default function MaintenancePage() {
  const { currentYacht, isLoading: yachtLoading } = useYacht();
  const router = useRouter();

  useEffect(() => {
    if (!yachtLoading && currentYacht) {
      router.replace(`/yachts/${currentYacht.id}/maintenance`);
    } else if (!yachtLoading && !currentYacht) {
      router.replace('/yachts');
    }
  }, [yachtLoading, currentYacht, router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-text-secondary">{translate('maintenance.loading')}</p>
      </div>
    </div>
  );
}
