'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { ChevronDown, RefreshCw } from 'lucide-react';

type Item = { item_id: string; name: string; rarity: string; discord_role_id: string | null };
type InventoryRow = { item_id: string; qty: number; items: Item | null };

type UserSummary = {
  discord_user_id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_seen_at: string | null;
};

export default function UsersAdminClient() {
  const toast = useToast();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const [balance, setBalance] = useState<number | null>(null);
  const [equippedItemId, setEquippedItemId] = useState<string | null>(null);
  const [inv, setInv] = useState<InventoryRow[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const [pointsBusy, setPointsBusy] = useState(false);
  const [deltaPoints, setDeltaPoints] = useState('100');
  const [setPoints, setSetPoints] = useState('');
  const [setTouched, setSetTouched] = useState(false);

  useEffect(() => {
    fetch('/api/admin/gacha/items')
      .then((r) => r.json())
      .then((b: { items: Item[] }) => setItems(b.items ?? []))
      .catch(() => toast.error('아이템을 불러오지 못했습니다.'));
  }, [toast]);

  const resetDetail = useCallback(() => {
    setBalance(null);
    setEquippedItemId(null);
    setInv([]);
    setSetTouched(false);
    setSetPoints('');
    setDeltaPoints('100');
    setDetailError(null);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setListBusy(true);
      setListError(null);
      const res = await fetch('/api/admin/users/list');
      const body = (await res.json()) as { users?: UserSummary[]; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setUsers(body?.users ?? []);
    } catch (e) {
      const message = e instanceof Error ? e.message : '유저 목록을 불러오지 못했습니다.';
      setListError(message);
      toast.error(message);
    } finally {
      setListBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const lookup = useCallback(
    async (overrideUserId?: string) => {
      try {
        const targetId = (overrideUserId ?? activeUserId ?? '').trim();
        if (!targetId) throw new Error('userId required');
        setDetailBusy(true);
        setDetailError(null);
        const res = await fetch(`/api/admin/users/lookup?userId=${encodeURIComponent(targetId)}`);
        const body = (await res.json()) as {
          balance: number;
          equipped: { item_id: string | null } | null;
          inventory: InventoryRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBalance(body.balance ?? 0);
        setEquippedItemId(body.equipped?.item_id ?? null);
        setInv(body.inventory ?? []);
        setSetTouched(false);
        setSetPoints(String(body.balance ?? 0));
      } catch (e) {
        const message = e instanceof Error ? e.message : '조회에 실패했습니다.';
        setDetailError(message);
        toast.error(message);
      } finally {
        setDetailBusy(false);
      }
    },
    [activeUserId, toast]
  );

  useEffect(() => {
    resetDetail();
    if (!activeUserId) return;
    void lookup(activeUserId);
  }, [activeUserId, lookup, resetDetail]);

  useEffect(() => {
    if (balance === null) return;
    if (!setTouched) setSetPoints(String(balance));
  }, [balance, setTouched]);

  const adjustPoints = useCallback(
    async (targetId: string, amount: number, reason = 'admin') => {
      if (pointsBusy) return;
      try {
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
    [pointsBusy, toast]
  );

  const applyDelta = useCallback(
    async (sign: 1 | -1) => {
      if (!activeUserId) {
        toast.error('유저를 선택해 주세요.');
        return;
      }
      const raw = deltaPoints.trim();
      const v = Number(raw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
        toast.error('조정 값은 1 이상의 정수여야 합니다.');
        return;
      }
      await adjustPoints(activeUserId, sign * v, 'admin_delta');
    },
    [activeUserId, adjustPoints, deltaPoints, toast]
  );

  const applySet = useCallback(async () => {
    if (!activeUserId) {
      toast.error('유저를 선택해 주세요.');
      return;
    }
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
    await adjustPoints(activeUserId, diff, 'admin_set');
  }, [activeUserId, adjustPoints, balance, setPoints, toast]);

  const setInventoryQty = useCallback(
    async (targetId: string, itemId: string, qty: number) => {
      try {
        if (!targetId) throw new Error('userId required');
        const res = await fetch('/api/admin/users/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetId, itemId, qty })
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        await lookup(targetId);
        toast.success('인벤토리 반영이 완료되었습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '인벤토리 반영에 실패했습니다.');
      }
    },
    [lookup, toast]
  );

  const setEquipped = useCallback(
    async (targetId: string, itemId: string | null) => {
      try {
        if (!targetId) throw new Error('userId required');
        const res = await fetch('/api/admin/users/equip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: targetId, itemId })
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        await lookup(targetId);
        toast.success('장착 상태 반영이 완료되었습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '장착 반영에 실패했습니다.');
      }
    },
    [lookup, toast]
  );

  const invMap = useMemo(() => new Map(inv.map((r) => [r.item_id, r.qty])), [inv]);
  const roleItems = useMemo(() => items.filter((item) => item.discord_role_id), [items]);
  const filteredUsers = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return users
      .filter((user) => Boolean(user.username))
      .filter((user) => {
        if (!q) return true;
        const name = user.username?.toLowerCase() ?? '';
        return name.includes(q) || user.discord_user_id.includes(q);
      });
  }, [users, searchText]);

  const formatDate = useCallback((value: string | null) => {
    if (!value) return '기록 없음';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('ko-KR', { hour12: false });
  }, []);

  const displayName = useCallback((user: UserSummary) => user.username ?? '알 수 없는 사용자', []);
  const avatarUrl = useCallback(
    (user: UserSummary) => user.avatar_url ?? 'https://cdn.discordapp.com/embed/avatars/0.png',
    []
  );

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">유저 관리</h1>
        <p className="mt-1 text-sm muted">포인트/인벤/장착 상태를 조정합니다.</p>

        <section className="mt-6 grid gap-4">
          <div className="rounded-3xl card-glass p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">서버 전체 유저</h2>
                <p className="mt-1 text-xs muted">
                  {searchText.trim().length
                    ? `${filteredUsers.length}명 / ${users.length}명`
                    : `총 ${users.length}명`}
                </p>
              </div>
              <button
                type="button"
                className="flex items-center gap-2 rounded-2xl btn-soft px-4 py-2 text-sm font-semibold"
                onClick={() => void loadUsers()}
                disabled={listBusy}
              >
                <RefreshCw className={`h-4 w-4 ${listBusy ? 'animate-spin' : ''}`} />
                {listBusy ? '불러오는 중…' : '새로고침'}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                className="flex-1 min-w-[160px] rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
                placeholder="유저 이름 또는 ID 검색…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="유저 검색"
              />
            </div>

            {listError ? (
              <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--fg)]">
                {listError}
              </div>
            ) : null}

            <div className="mt-4 max-h-[560px] overflow-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]">
              {listBusy && filteredUsers.length === 0 ? (
                <div className="p-4 text-sm muted">유저 목록을 불러오는 중입니다.</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-sm muted">등록된 유저가 없습니다.</div>
              ) : (
                <div className="grid gap-2 p-2">
                  {filteredUsers.map((u) => {
                    const isOpen = activeUserId === u.discord_user_id;
                    return (
                      <div
                        key={u.discord_user_id}
                        className={`rounded-2xl border border-[color:var(--border)] ${
                          isOpen ? 'bg-[color:var(--card)]' : 'bg-[color:var(--chip)]'
                        }`}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-[color:var(--card)]"
                          onClick={() => setActiveUserId(isOpen ? null : u.discord_user_id)}
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="h-9 w-9 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white/70">
                                <Image src={avatarUrl(u)} alt="" width={36} height={36} className="h-9 w-9 object-cover" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[color:var(--fg)]">
                                  {displayName(u)}
                                </div>
                                <div className="truncate text-[11px] muted-2">
                                  {u.discord_user_id} · 최근 활동: {formatDate(u.last_seen_at)} · 가입: {formatDate(u.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs muted">
                            {isOpen ? '닫기' : '관리'}
                            <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {isOpen ? (
                          <div className="border-t border-[color:var(--border)] px-4 pb-4 pt-3">
                            {detailBusy ? (
                              <div className="text-sm muted">상세 정보를 불러오는 중입니다.</div>
                            ) : detailError ? (
                              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm">
                                {detailError}
                              </div>
                            ) : balance !== null ? (
                              <section className="mt-2 grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                                  <h3 className="text-sm font-semibold">포인트</h3>
                                  <p className="mt-1 text-xs muted">현재: {balance}p</p>
                                  <div className="mt-3 grid gap-3">
                                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3">
                                      <div className="text-[11px] font-semibold muted-2">빠른 조정</div>
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

                                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3">
                                      <div className="text-[11px] font-semibold muted-2">잔액 설정</div>
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

                                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                                  <h3 className="text-sm font-semibold">장착</h3>
                                  <p className="mt-1 text-xs muted">장착 아이템 ID: {equippedItemId ?? '없음'}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      className="rounded-xl btn-soft px-3 py-2 text-sm"
                                      onClick={() => activeUserId && void setEquipped(activeUserId, null)}
                                    >
                                      해제
                                    </button>
                                    {roleItems.slice(0, 8).map((it) => (
                                      <button
                                        key={it.item_id}
                                        type="button"
                                        className="rounded-xl btn-soft px-3 py-2 text-sm"
                                        onClick={() => activeUserId && void setEquipped(activeUserId, it.item_id)}
                                      >
                                        {it.name}
                                      </button>
                                    ))}
                                  </div>
                                  <p className="mt-3 text-[11px] muted-2">
                                    역할 적용은 봇 워커가 처리합니다. 봇 권한/계층 문제로 실패할 수 있습니다.
                                  </p>
                                </div>

                                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 lg:col-span-2">
                                  <h3 className="text-sm font-semibold">인벤토리 수량</h3>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {roleItems.map((it) => {
                                      const qty = invMap.get(it.item_id) ?? 0;
                                      return (
                                        <div
                                          key={it.item_id}
                                          className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2"
                                        >
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
                                            onBlur={(e) =>
                                              activeUserId && void setInventoryQty(activeUserId, it.item_id, Number(e.target.value))
                                            }
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </section>
                            ) : (
                              <div className="text-sm muted">유저를 선택하면 상세 정보를 표시합니다.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
