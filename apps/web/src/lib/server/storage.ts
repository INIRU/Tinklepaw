import 'server-only';

import { createSupabaseAdminClient } from './supabase-admin';

export const DEFAULT_BUCKET = 'bangul-assets';

export async function ensureBucketExists(bucket = DEFAULT_BUCKET) {
  const supabase = createSupabaseAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.name === bucket);
  if (exists) return;

  // Try create as public bucket. Ignore conflict.
  await supabase.storage.createBucket(bucket, { public: true }).catch(() => null);
}

export async function uploadPublicImage(params: {
  bucket?: string;
  path: string;
  file: File;
  upsert?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  const bucket = params.bucket ?? DEFAULT_BUCKET;

  await ensureBucketExists(bucket);

  const buf = new Uint8Array(await params.file.arrayBuffer());
  const blob = new Blob([buf], { type: params.file.type || 'application/octet-stream' });

  const { error } = await supabase.storage.from(bucket).upload(params.path, blob, {
    contentType: params.file.type || undefined,
    upsert: params.upsert ?? true
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(params.path);
  return { publicUrl: data.publicUrl };
}

export async function removeObjects(params: { bucket?: string; paths: string[] }) {
  const supabase = createSupabaseAdminClient();
  const bucket = params.bucket ?? DEFAULT_BUCKET;
  await ensureBucketExists(bucket);
  const { error } = await supabase.storage.from(bucket).remove(params.paths);
  if (error) throw error;
}

export async function moveObject(params: { bucket?: string; from: string; to: string }) {
  const supabase = createSupabaseAdminClient();
  const bucket = params.bucket ?? DEFAULT_BUCKET;
  await ensureBucketExists(bucket);
  const { error } = await supabase.storage.from(bucket).move(params.from, params.to);
  if (error) throw error;
}
