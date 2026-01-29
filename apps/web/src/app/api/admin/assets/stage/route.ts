import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { uploadPublicImage, removeObjects } from '@/lib/server/storage';

export const runtime = 'nodejs';

const ALLOWED_KEYS = new Set(['banner', 'icon']);
const STAGED_PREFIX = 'site/staged/';

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
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 8MB)' }, { status: 400 });
  }

  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stagedPath = `${STAGED_PREFIX}${key}-${id}.png`;
  const { publicUrl } = await uploadPublicImage({ path: stagedPath, file, upsert: false });

  return NextResponse.json({ ok: true, key, stagedPath, publicUrl });
}

export async function DELETE(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path || !path.startsWith(STAGED_PREFIX)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  await removeObjects({ paths: [path] });
  return NextResponse.json({ ok: true });
}
