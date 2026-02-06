import { InboxFilters } from '@/components/shared/inbox-filters';
import { InboxSections } from '@/components/shared/inbox-sections';

export default function HomePage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Inbox Operativo</h1>
      <InboxFilters />
      <InboxSections />
    </section>
  );
}
