'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { Search } from 'lucide-react';

type Item = { item_id: string; name: string; rarity: string; discord_role_id: string | null };
type InventoryRow = { item_id: string; qty: number; items: Item | null };

type MemberHit = {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string | null;
};

export default function UsersAdminClient() {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [equippedItemId, setEquippedItemId] = useState<string | null>(null);
  const [inv, setInv] = useState<InventoryRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [pointsBusy, setPointsBusy] = useState(false);
  const [deltaPoints, setDeltaPoints] = useState('100');
  const [setPoints, setSetPoints] = useState('');
  const [setTouched, setSetTouched] = useState(false);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MemberHit | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/admin/gacha/items')
      .then((r) => r.json())
      .then((b: { items: Item[] }) => setItems(b.items ?? []))
      .catch(() => toast.error('아이템을 불러오지 못했습니다.'));
  }, [toast]);

  useEffect(() => {
    const q = query.trim();
    setSelected(null);
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const t = window.setTimeout(() => {
      fetch(`/api/admin/discord/member-search?q=${encodeURIComponent(q)}&limit=25`, { signal: controller.signal })
        .then((r) => r.json().then((body) => ({ ok: r.ok, status: r.status, body })))
        .then(({ ok, status, body }) => {
          if (!ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${status}`);
          const members = ((body as { members?: MemberHit[] } | null)?.members ?? []).slice(0, 25);
          setHits(members);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          toast.error(e instanceof Error ? e.message : '검색에 실패했습니다.');
          setHits([]);
        })
        .finally(() => {
          if (abortRef.current === controller) {
            setSearching(false);
          }
        });
    }, 260);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query, toast]);

  const lookup = useCallback(async (overrideUserId?: string) => {
    try {
      const targetId = (overrideUserId ?? userId).trim();
      if (!targetId) throw new Error('userId required');
      const res = await fetch(`/api/admin/users/lookup?userId=${encodeURIComponent(targetId)}`);
      const body = (await res.json()) as { balance: number; equipped: { item_id: string | null } | null; inventory: InventoryRow[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setBalance(body.balance ?? 0);
      setEquippedItemId(body.equipped?.item_id ?? null);
      setInv(body.inventory ?? []);
      setSetTouched(false);
      setSetPoints(String(body.balance ?? 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회에 실패했습니다.');
    }
  }, [toast, userId]);

  useEffect(() => {
    if (balance === null) return;
    if (!setTouched) setSetPoints(String(balance));
  }, [balance, setTouched]);

  const adjustPoints = useCallback(
    async (amount: number, reason = 'admin') => {
      if (pointsBusy) return;
      try {
        const targetId = userId.trim();
        if (!targetId) throw new Error('userId required');
        if (!Number.isFinite(amount) || !Number.isInteger(amount)) throw new Error('amount must be an integer');
        setPointsBusy(true);
        const res = await fetch('/api/admin/users/points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetId, amount, reason })
        });
        const body = (await res.json().catch(() => null)) as { error?: string; balance?: number } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        const nextBalance = typeof body?.balance === 'number' ? body.balance : null;
        if (nextBalance !== null) {
          setBalance(nextBalance);
          setSetTouched(false);
          setSetPoints(String(nextBalance));
        }
        toast.success('포인트 반영이 완료되었습니다.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '포인트 반영에 실패했습니다.');
      } finally {
        setPointsBusy(false);
      }
    },
    [pointsBusy, toast, userId]
  );

  const applyDelta = useCallback(
    async (sign: 1 | -1) => {
      const raw = deltaPoints.trim();
      const v = Number(raw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
        toast.error('조정 값은 1 이상의 정수여야 합니다.');
        return;
      }
      await adjustPoints(sign * v, 'admin_delta');
    },
    [adjustPoints, deltaPoints, toast]
  );

  const applySet = useCallback(async () => {
    if (balance === null) return;
    const raw = setPoints.trim();
    const desired = Number(raw);
    if (!Number.isFinite(desired) || !Number.isInteger(desired) || desired < 0) {
      toast.error('잔액은 0 이상의 정수여야 합니다.');
      return;
    }
    const diff = desired - balance;
    if (diff === 0) {
      toast.info('이미 해당 잔액입니다.', { durationMs: 2000 });
      return;
    }
    await adjustPoints(diff, 'admin_set');
  }, [adjustPoints, balance, setPoints, toast]);

  const setInventoryQty = useCallback(
    async (itemId: string, qty: number) => {
      try {
        const res = await fetch('/api/admin/users/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, itemId, qty })
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        await lookup();
        toast.success('인벤토리 반영이 완료되었습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '인벤토리 반영에 실패했습니다.');
      }
    },
    [lookup, toast, userId]
  );

  const setEquipped = useCallback(
    async (itemId: string | null) => {
      try {
        const res = await fetch('/api/admin/users/equip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, itemId })
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        await lookup();
        toast.success('장착 상태 반영이 완료되었습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '장착 반영에 실패했습니다.');
      }
    },
    [lookup, toast, userId]
  );

  const invMap = useMemo(() => new Map(inv.map((r) => [r.item_id, r.qty])), [inv]);

  const displayName = useCallback((m: MemberHit) => m.nick ?? m.globalName ?? m.username, []);

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">유저 관리</h1>
        <p className="mt-1 text-sm muted">포인트/인벤/장착 상태를 조정합니다.</p>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl card-glass p-6">
            <h2 className="text-lg font-semibold">이름으로 검색</h2>
            <p className="mt-2 text-xs muted">닉네임/표시 이름/유저명으로 검색 후 선택하실 수 있습니다.</p>
            <div className="mt-4">
              <label className="block text-sm">
                <span className="sr-only">검색</span>
                <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                  <Search className="h-4 w-4 text-[color:var(--muted-2)]" aria-hidden="true" />
                  <input
                    className="w-full bg-transparent text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] outline-none"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="예: 방울냥, nyang"
                    aria-label="유저 검색"
                  />
                  <div className="shrink-0 whitespace-nowrap rounded-full border border-[color:var(--border)] bg-[color:var(--bg)]/50 px-2 py-1 text-[11px] leading-none muted-2">
                    {searching ? '검색 중…' : `${hits.length}건`}
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-2">
              {hits.length === 0 ? (
                <div className="p-3 text-sm muted">검색어를 2자 이상 입력해 주세요.</div>
              ) : (
                <div className="grid gap-1">
                  {hits.map((m) => {
                    const name = displayName(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-transparent bg-[color:var(--chip)] px-3 py-2 text-left hover:border-[color:var(--border)]"
                        onClick={() => {
                          setSelected(m);
                          setUserId(m.id);
                          void lookup(m.id);
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-9 w-9 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white/60">
                            {m.avatarUrl ? (
                              <Image src={m.avatarUrl} alt="" width={36} height={36} className="h-9 w-9" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[color:var(--fg)]">{name}</div>
                            <div className="truncate text-[11px] muted-2">
                              @{m.username} · {m.id}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs muted">선택</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selected ? (
              <div className="mt-3 text-xs muted">
                선택됨: <span className="font-semibold text-[color:var(--fg)]">{displayName(selected)}</span> ({selected.id})
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl card-glass p-6">
            <h2 className="text-lg font-semibold">ID로 조회</h2>
            <p className="mt-2 text-xs muted">검색이 어려운 경우 Discord 유저 ID로 직접 조회하실 수 있습니다.</p>
            <label className="mt-4 block text-sm">
              Discord 유저 ID
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="예: 123456789012345678"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold"
                onClick={() => void lookup()}
                disabled={!userId.trim().length}
              >
                조회
              </button>
              <button
                type="button"
                className="rounded-2xl btn-soft px-4 py-3 text-sm font-semibold"
                onClick={() => {
                  setUserId('');
                  setBalance(null);
                  setEquippedItemId(null);
                  setInv([]);
                  setSetTouched(false);
                  setSetPoints('');
                }}
              >
                초기화
              </button>
            </div>
          </div>
        </section>

      {balance !== null ? (
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl card-glass p-6">
            <h2 className="text-lg font-semibold">포인트</h2>
            <p className="mt-2 text-sm muted">현재: {balance}p</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                <div className="text-xs font-semibold muted-2">빠른 조정</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="w-28 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                    type="number"
                    min={1}
                    step={1}
                    value={deltaPoints}
                    onChange={(e) => setDeltaPoints(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-xl btn-soft px-3 py-2 text-sm disabled:opacity-60"
                    onClick={() => void applyDelta(1)}
                    disabled={pointsBusy}
                  >
                    {pointsBusy ? '처리 중…' : `+${deltaPoints || 0}p`}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl btn-soft px-3 py-2 text-sm disabled:opacity-60"
                    onClick={() => void applyDelta(-1)}
                    disabled={pointsBusy}
                  >
                    {pointsBusy ? '처리 중…' : `-${deltaPoints || 0}p`}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                <div className="text-xs font-semibold muted-2">잔액 설정</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="w-32 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                    type="number"
                    min={0}
                    step={1}
                    value={setPoints}
                    onChange={(e) => {
                      setSetTouched(true);
                      setSetPoints(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-2xl btn-bangul px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    onClick={() => void applySet()}
                    disabled={pointsBusy}
                  >
                    {pointsBusy ? '처리 중…' : '설정'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl card-glass p-6">
            <h2 className="text-lg font-semibold">장착</h2>
            <p className="mt-2 text-sm muted">장착 아이템 ID: {equippedItemId ?? '없음'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl btn-soft px-3 py-2 text-sm"
                onClick={() => void setEquipped(null)}
              >
                해제
              </button>
              {items.slice(0, 8).map((it) => (
                <button
                  key={it.item_id}
                  type="button"
                  className="rounded-xl btn-soft px-3 py-2 text-sm"
                  onClick={() => void setEquipped(it.item_id)}
                >
                  {it.name}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs muted-2">역할 적용은 봇 워커가 처리합니다. 봇 권한/계층 문제로 실패할 수 있습니다.</p>
          </div>

          <div className="rounded-3xl card-glass p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold">인벤토리 수량</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {items.map((it) => {
                const qty = invMap.get(it.item_id) ?? 0;
                return (
                   <div key={it.item_id} className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                     <div className="text-sm">{it.name}</div>
                     <input
                      className="w-24 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-2 py-1 text-sm text-[color:var(--fg)]"
                      type="number"
                      value={qty}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setInv((prev) => {
                          const next = prev.filter((r) => r.item_id !== it.item_id);
                          next.unshift({ item_id: it.item_id, qty: v, items: it });
                          return next;
                        });
                      }}
                      onBlur={(e) => void setInventoryQty(it.item_id, Number(e.target.value))}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
      </div>
    </main>
  );
}
