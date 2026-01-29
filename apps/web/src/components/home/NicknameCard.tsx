'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';

export default function NicknameCard(props: { initial: string }) {
  const toast = useToast();
  const [nickname, setNickname] = useState(props.initial);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/profile/nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      toast.success('저장했습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '실패했습니다.');
    } finally {
      setBusy(false);
    }
  }, [nickname, toast]);

  return (
    <section className="rounded-3xl card-glass p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold font-bangul">닉네임</h2>
          <p className="mt-1 text-xs muted">서버 닉네임을 수정해.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          className="h-11 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="2~32자"
          maxLength={32}
        />
        <button
          type="button"
          className="h-11 shrink-0 rounded-xl btn-bangul px-4 text-sm font-semibold disabled:opacity-60"
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      <p className="mt-2 text-xs muted-2">봇이 닉네임 변경 권한을 가지고 있어야 적용돼.</p>
    </section>
  );
}
