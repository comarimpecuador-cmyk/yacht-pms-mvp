'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useYacht } from '@/lib/yacht-context';

export default function DocumentsPage() {
  const { currentYacht, isLoading: yachtLoading } = useYacht();
  const router = useRouter();

  useEffect(() => {
    if (!yachtLoading && currentYacht) {
      router.replace(`/yachts/${currentYacht.id}/documents`);
    } else if (!yachtLoading && !currentYacht) {
      router.replace('/yachts');
    }
  }, [yachtLoading, currentYacht, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-info" />
        <p className="text-text-secondary">Cargando documentos...</p>
      </div>
    </div>
  );
}
