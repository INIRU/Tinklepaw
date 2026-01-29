import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { removeObjects, uploadPublicImage } from '@/lib/server/storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const form = await req.formData();
  const poolId = String(form.get('poolId') ?? '').trim();
  const file = form.get('file');
  if (!poolId) return NextResponse.json({ error: 'poolId required' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });

  const ext = (() => {
    if (file.type === 'image/gif') return 'gif';
    if (file.type === 'image/avif') return 'avif';
    if (file.type === 'image/webp') return 'webp';
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/jpeg') return 'jpg';
    return 'png';
  })();

  const base = `gacha/pools/${poolId}`;
  const allPaths = [`${base}.gif`, `${base}.avif`, `${base}.webp`, `${base}.png`, `${base}.jpg`, `${base}.jpeg`];
  await removeObjects({ paths: allPaths }).catch(() => null);

  const path = `${base}.${ext}`;
  const { publicUrl } = await uploadPublicImage({ path, file, upsert: true });

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('gacha_pools').update({ banner_image_url: publicUrl }).eq('pool_id', poolId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, publicUrl });
}

export async function DELETE(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const url = new URL(req.url);
  const poolId = (url.searchParams.get('poolId') ?? '').trim();
  if (!poolId) return NextResponse.json({ error: 'poolId required' }, { status: 400 });

  const base = `gacha/pools/${poolId}`;
  const allPaths = [`${base}.gif`, `${base}.avif`, `${base}.webp`, `${base}.png`, `${base}.jpg`, `${base}.jpeg`];
  await removeObjects({ paths: allPaths }).catch(() => null);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('gacha_pools').update({ banner_image_url: null }).eq('pool_id', poolId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
