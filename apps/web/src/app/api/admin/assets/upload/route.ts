import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { uploadPublicImage } from '@/lib/server/storage';

export const runtime = 'nodejs';

const ALLOWED_KEYS = new Set(['banner', 'icon']);

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const form = await req.formData();
  const key = String(form.get('key') ?? '');
  const file = form.get('file');

  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File required' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
  }
  if (file.size > 6 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 6MB)' }, { status: 400 });
  }

  const ext = (() => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.png')) return 'png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';
    if (name.endsWith('.webp')) return 'webp';
    return 'bin';
  })();

  const path = `site/${key}.${ext}`;
  const { publicUrl } = await uploadPublicImage({ path, file });

  const supabase = createSupabaseAdminClient();
  const patch = key === 'banner' ? { banner_image_url: publicUrl } : { icon_image_url: publicUrl };
  const { error: upErr } = await supabase.from('app_config').update(patch).eq('id', 1);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, key, publicUrl });
}
