import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';
import { moveObject, removeObjects } from '@/lib/server/storage';

export const runtime = 'nodejs';

const ALLOWED_KEYS = new Set(['banner', 'icon']);
const STAGED_PREFIX = 'site/staged/';

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  await getOrInitAppConfig();

  const body = (await req.json()) as { key?: string; stagedPath?: string };
  const key = String(body.key ?? '');
  const stagedPath = String(body.stagedPath ?? '');

  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }
  if (!stagedPath.startsWith(STAGED_PREFIX)) {
    return NextResponse.json({ error: 'Invalid stagedPath' }, { status: 400 });
  }

  const finalPath = key === 'banner' ? 'site/banner.png' : 'site/icon.png';

  // Ensure overwrite works by removing the destination first.
  await removeObjects({ paths: [finalPath] }).catch(() => null);

  // Supabase move does not overwrite existing objects.
  await moveObject({ from: stagedPath, to: finalPath });

  // Move may change public URL host formatting, always recompute.
  const supabase = createSupabaseAdminClient();
  const { data } = supabase.storage.from('bangul-assets').getPublicUrl(finalPath);
  const publicUrl = data.publicUrl;

  const patch = key === 'banner' ? { banner_image_url: publicUrl } : { icon_image_url: publicUrl };
  const { error } = await supabase.from('app_config').update(patch).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, key, publicUrl });
}
