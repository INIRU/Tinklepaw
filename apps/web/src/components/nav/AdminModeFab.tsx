"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Shield, ShieldOff } from 'lucide-react';

type Props = {
  visible: boolean;
  enabled: boolean;
};

export default function AdminModeFab({ visible, enabled }: Props) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [pending, setPending] = useState(false);

  if (!visible) return null;

  const toggle = async () => {
    if (pending) return;
    const next = !isEnabled;
    setPending(true);

    try {
      const res = await fetch('/api/admin/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setIsEnabled(next);
      router.refresh();
    } catch (e) {
      console.error('[AdminModeFab] failed to toggle admin mode:', e);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={isEnabled ? '관리자 모드 끄기' : '관리자 모드 켜기'}
      title={isEnabled ? '관리자 모드 ON (클릭 시 OFF)' : '관리자 모드 OFF (클릭 시 ON)'}
      className={`fixed right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border)] shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur transition active:scale-95 bottom-[calc(env(safe-area-inset-bottom)+1rem)] ${
        isEnabled
          ? 'bg-[color:var(--accent-pink)] text-white'
          : 'bg-[color:var(--card)] text-[color:var(--fg)]'
      } ${pending ? 'opacity-70 cursor-wait' : 'cursor-pointer hover:brightness-110'}`}
    >
      {isEnabled ? <Shield className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
    </button>
  );
}
