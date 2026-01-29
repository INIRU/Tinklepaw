import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminNotificationPageClient } from './ui';

export default async function AdminNotificationPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <AdminNotificationPageClient />
    </div>
  );
}
