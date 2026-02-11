'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

async function loadHtmlImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
}

function extFromMime(mime: string) {
  if (mime === 'image/avif') return 'avif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'bin';
}

async function canvasToFile(params: {
  canvas: HTMLCanvasElement;
  fileNameBase: string;
  preferredMimes: string[];
  quality?: number;
}): Promise<File> {
  const quality = params.quality ?? 0.82;

  for (const mime of params.preferredMimes) {
    // Safari/Firefox may return null for unsupported mime.
    const blob = await new Promise<Blob | null>((resolve) => {
      params.canvas.toBlob((b) => resolve(b), mime, quality);
    });
    if (!blob) continue;
    const ext = extFromMime(mime);
    return new File([blob], `${params.fileNameBase}.${ext}`, { type: mime });
  }
  throw new Error('이미지 생성에 실패했습니다.');
}

export function ImageCropModal(props: {
  title: string;
  description?: ReactNode;
  src: string;
  aspect: number;
  output: { width: number; height: number; fileNameBase: string };
  preferredOutputMimes: string[];
  quality?: number;
  onClose: () => void;
  onConfirm: (file: File) => void;
  busy?: boolean;
}) {
  const { ref: frameRef, size: frameSize } = useElementSize<HTMLDivElement>();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setLocalError(null);
    loadHtmlImage(props.src)
      .then((loaded) => {
        if (!alive) return;
        setImg(loaded);
      })
      .catch(() => {
        if (!alive) return;
        setImg(null);
        setLocalError('이미지를 미리보기에 불러오지 못했습니다. GIF 파일이라면 PNG/JPG로 변환 후 다시 시도해 주세요.');
      });
    return () => {
      alive = false;
    };
  }, [props.src]);

  const baseScale = useMemo(() => {
    if (!img) return 1;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const fw = frameSize.width;
    const fh = frameSize.height;
    return Math.max(fw / iw, fh / ih);
  }, [img, frameSize.height, frameSize.width]);

  const clampedOffset = useMemo(() => {
    if (!img) return offset;
    const s = baseScale * zoom;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const maxX = Math.max(0, (dw - frameSize.width) / 2);
    const maxY = Math.max(0, (dh - frameSize.height) / 2);
    return {
      x: clamp(offset.x, -maxX, maxX),
      y: clamp(offset.y, -maxY, maxY)
    };
  }, [baseScale, frameSize.height, frameSize.width, img, offset, zoom]);

  useEffect(() => {
    setOffset(clampedOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedOffset.x, clampedOffset.y]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!img) return;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: clampedOffset.x,
        startOffsetY: clampedOffset.y
      };
    },
    [clampedOffset.x, clampedOffset.y, img]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.startOffsetX + dx, y: dragRef.current.startOffsetY + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const confirm = useCallback(async () => {
    if (!img) return;
    setLocalError(null);
    try {
      const fw = frameSize.width;
      const fh = frameSize.height;
      const s = baseScale * zoom;

      const sx = img.naturalWidth / 2 + (-fw / 2 - clampedOffset.x) / s;
      const sy = img.naturalHeight / 2 + (-fh / 2 - clampedOffset.y) / s;
      const sw = fw / s;
      const sh = fh / s;

      const canvas = document.createElement('canvas');
      canvas.width = props.output.width;
      canvas.height = props.output.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const file = await canvasToFile({
        canvas,
        fileNameBase: props.output.fileNameBase,
        preferredMimes: props.preferredOutputMimes,
        quality: props.quality
      });
      props.onConfirm(file);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '이미지 생성에 실패했습니다.');
    }
  }, [baseScale, clampedOffset.x, clampedOffset.y, frameSize.height, frameSize.width, img, props, zoom]);

  const frameStyle: React.CSSProperties = {
    aspectRatio: `${props.aspect}`
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => (props.busy ? null : props.onClose())} />
      <div className="relative w-full max-w-2xl rounded-3xl card-glass p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{props.title}</div>
            {props.description ? <div className="mt-1 text-xs muted">{props.description}</div> : null}
          </div>
          <button
            type="button"
            className="rounded-xl btn-soft px-3 py-2 text-xs"
            onClick={() => (props.busy ? null : props.onClose())}
          >
            닫기
          </button>
        </div>

        <div className="mt-4">
          <div
            ref={frameRef}
            className="relative w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20"
            style={frameStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img ? (
              <NextImage
                src={props.src}
                alt=""
                width={img.naturalWidth}
                height={img.naturalHeight}
                unoptimized
                loader={({ src }) => src}
                className="absolute left-1/2 top-1/2 max-w-none select-none"
                draggable={false}
                style={{
                  transform: `translate(-50%, -50%) translate(${clampedOffset.x}px, ${clampedOffset.y}px) scale(${baseScale * zoom})`,
                  transformOrigin: 'center'
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center text-sm muted px-4">
                {localError ?? '불러오는 중…'}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="muted">확대</span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-48"
              />
            </label>
            <button
              type="button"
              className="rounded-xl btn-soft px-3 py-2 text-xs"
              onClick={() => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              disabled={props.busy}
            >
              리셋
            </button>
            <button
              type="button"
              className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
              onClick={() => void confirm()}
              disabled={!img || props.busy}
            >
              {props.busy ? '처리 중…' : '확정'}
            </button>
            {localError ? <div className="text-xs text-red-200">{localError}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
