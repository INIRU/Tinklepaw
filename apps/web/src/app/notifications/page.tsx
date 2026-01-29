import { auth } from '../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { redirect } from 'next/navigation';
import { NotificationClientPage } from './ui';
import type { Database } from '@nyaru/core';

type Notification = Database['nyang']['Tables']['notifications']['Row'];

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const supabase = createSupabaseAdminClient();
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <NotificationClientPage
        initialNotifications={(notifications as Notification[]) || []}
        userId={session.user.id}
      />
    </div>
  );
}
