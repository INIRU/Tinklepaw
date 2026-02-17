'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { ChevronDown, RefreshCw, Search, ShieldCheck, Wallet } from 'lucide-react';

type Item = { item_id: string; name: string; rarity: string; discord_role_id: string | null };
type InventoryRow = { item_id: string; qty: number; items: Item | null };

type UserSummary = {
  discord_user_id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_seen_at: string | null;
};

type GuildRole = {
  id: string;
  name: string;
  position: number;
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
  const [guildRoles, setGuildRoles] = useState<GuildRole[]>([]);
  const [memberRoleIds, setMemberRoleIds] = useState<string[]>([]);
  const [rolesBusy, setRolesBusy] = useState(false);
  const [roleSearchText, setRoleSearchText] = useState('');
  const [inventorySearchText, setInventorySearchText] = useState('');

  const [pointsBusy, setPointsBusy] = useState(false);
  const [deltaPoints, setDeltaPoints] = useState('100');
  const [setPoints, setSetPoints] = useState('');
  const [setTouched, setSetTouched] = useState(false);

  useEffect(() => {
    const loadMetadata = async () => {
      const [itemsRes, rolesRes] = await Promise.all([
        fetch('/api/admin/gacha/items').catch(() => null),
        fetch('/api/admin/discord/roles').catch(() => null)
      ]);

      if (!itemsRes) {
        toast.error('아이템을 불러오지 못했습니다.');
      } else {
        const body = (await itemsRes.json().catch(() => null)) as { items?: Item[] } | null;
        if (!itemsRes.ok) {
          toast.error('아이템을 불러오지 못했습니다.');
        } else {
          setItems(body?.items ?? []);
        }
      }

      if (!rolesRes) {
        toast.error('역할 목록을 불러오지 못했습니다.');
      } else {
        const body = (await rolesRes.json().catch(() => null)) as { roles?: GuildRole[] } | null;
        if (!rolesRes.ok) {
          toast.error('역할 목록을 불러오지 못했습니다.');
        } else {
          setGuildRoles(body?.roles ?? []);
        }
      }
    };

    void loadMetadata();
  }, [toast]);

  const resetDetail = useCallback(() => {
    setBalance(null);
    setEquippedItemId(null);
    setInv([]);
    setSetTouched(false);
    setSetPoints('');
    setDeltaPoints('100');
    setMemberRoleIds([]);
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
          memberRoleIds?: string[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBalance(body.balance ?? 0);
        setEquippedItemId(body.equipped?.item_id ?? null);
        setInv(body.inventory ?? []);
        setMemberRoleIds(Array.isArray(body.memberRoleIds) ? body.memberRoleIds.filter((id) => typeof id === 'string') : []);
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

  const toggleRole = useCallback(
    async (roleId: string) => {
      if (!activeUserId) {
        toast.error('유저를 선택해 주세요.');
        return;
      }
      if (rolesBusy) return;

      const hasRole = memberRoleIds.includes(roleId);

      try {
        setRolesBusy(true);
        const res = await fetch('/api/admin/users/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: activeUserId, roleId, op: hasRole ? 'remove' : 'add' })
        });
        const body = (await res.json().catch(() => null)) as { error?: string; memberRoleIds?: string[] } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);

        if (Array.isArray(body?.memberRoleIds)) {
          setMemberRoleIds(body.memberRoleIds.filter((id): id is string => typeof id === 'string'));
        } else {
          setMemberRoleIds((prev) => (hasRole ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
        }

        toast.success(hasRole ? '역할을 해제했습니다.' : '역할을 부여했습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '역할 변경에 실패했습니다.');
      } finally {
        setRolesBusy(false);
      }
    },
    [activeUserId, memberRoleIds, rolesBusy, toast]
  );

  const invMap = useMemo(() => new Map(inv.map((r) => [r.item_id, r.qty])), [inv]);
  const roleItems = useMemo(() => items.filter((item) => item.discord_role_id), [items]);
  const activeUser = useMemo(
    () => users.find((user) => user.discord_user_id === activeUserId) ?? null,
    [users, activeUserId]
  );
  const userStats = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let active24h = 0;
    let active7d = 0;

    for (const user of users) {
      const ts = user.last_seen_at ? new Date(user.last_seen_at).getTime() : Number.NaN;
      if (!Number.isFinite(ts)) continue;
      const age = now - ts;
      if (age <= dayMs) active24h += 1;
      if (age <= dayMs * 7) active7d += 1;
    }

    return {
      total: users.length,
      active24h,
      active7d
    };
  }, [users]);
  const assignedRoles = useMemo(
    () => guildRoles.filter((role) => memberRoleIds.includes(role.id)),
    [guildRoles, memberRoleIds]
  );
  const filteredGuildRoles = useMemo(() => {
    const q = roleSearchText.trim().toLowerCase();
    if (!q) return guildRoles;
    return guildRoles.filter((role) => role.name.toLowerCase().includes(q) || role.id.includes(q));
  }, [guildRoles, roleSearchText]);
  const filteredRoleItems = useMemo(() => {
    const q = inventorySearchText.trim().toLowerCase();
    if (!q) return roleItems;
    return roleItems.filter((item) => item.name.toLowerCase().includes(q) || item.item_id.includes(q));
  }, [roleItems, inventorySearchText]);
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

  const quickDeltaPresets = [50, 100, 300, 500, 1000];

  return (
    <main className="p-6 pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">유저 관리</h1>
        <p className="mt-1 text-sm muted">유저별 포인트·장착·역할·인벤토리를 빠르게 조정할 수 있습니다.</p>

        <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <div className="muted-2">전체 유저</div>
            <div className="mt-1 text-sm font-semibold">{userStats.total.toLocaleString()}명</div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <div className="muted-2">최근 24시간 활성</div>
            <div className="mt-1 text-sm font-semibold">{userStats.active24h.toLocaleString()}명</div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <div className="muted-2">최근 7일 활성</div>
            <div className="mt-1 text-sm font-semibold">{userStats.active7d.toLocaleString()}명</div>
          </div>
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <aside className="rounded-3xl card-glass p-4 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">유저 목록</h2>
                <p className="mt-1 text-xs muted">
                  {searchText.trim().length ? `${filteredUsers.length}명 / ${users.length}명` : `총 ${users.length}명`}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl btn-soft px-3 py-2 text-xs font-semibold"
                onClick={() => void loadUsers()}
                disabled={listBusy}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${listBusy ? 'animate-spin' : ''}`} />
                {listBusy ? '로딩' : '새로고침'}
              </button>
            </div>

            <div className="mt-3 relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]" />
              <input
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] py-2 pl-9 pr-3 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
                placeholder="이름 또는 ID 검색"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>

            {listError ? (
              <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-xs text-[color:var(--fg)]">
                {listError}
              </div>
            ) : null}

            <div className="mt-3 max-h-[56svh] overflow-auto space-y-2 pr-1 lg:max-h-[72svh]">
              {listBusy && filteredUsers.length === 0 ? (
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-3 text-xs muted">
                  유저 목록을 불러오는 중입니다.
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-3 text-xs muted">
                  조건에 맞는 유저가 없습니다.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const selected = activeUserId === u.discord_user_id;
                  return (
                    <button
                      key={u.discord_user_id}
                      type="button"
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? 'border-[color:var(--accent-pink)]/60 bg-[color:var(--accent-pink)]/10'
                          : 'border-[color:var(--border)] bg-[color:var(--card)] hover:border-[color:var(--fg)]/20'
                      }`}
                      onClick={() => setActiveUserId(u.discord_user_id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 overflow-hidden rounded-xl border border-[color:var(--border)] bg-white/70">
                          <Image src={avatarUrl(u)} alt="" width={32} height={32} className="h-8 w-8 object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{displayName(u)}</div>
                          <div className="truncate text-[11px] muted-2">{u.discord_user_id}</div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-[color:var(--muted)] transition ${selected ? 'rotate-180' : '-rotate-90'}`} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="rounded-3xl card-glass p-5 sm:p-6">
            {!activeUser ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] px-4 py-10 text-center text-sm muted">
                왼쪽에서 관리할 유저를 선택하세요.
              </div>
            ) : detailBusy ? (
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-6 text-sm muted">
                {displayName(activeUser)} 상세 정보를 불러오는 중입니다.
              </div>
            ) : detailError ? (
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm">
                {detailError}
              </div>
            ) : balance !== null ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white/70">
                        <Image src={avatarUrl(activeUser)} alt="" width={48} height={48} className="h-12 w-12 object-cover" />
                      </div>
                      <div>
                        <div className="text-base font-semibold">{displayName(activeUser)}</div>
                        <div className="text-[11px] muted-2">{activeUser.discord_user_id}</div>
                        <div className="text-[11px] muted-2">최근 활동: {formatDate(activeUser.last_seen_at)} · 가입: {formatDate(activeUser.created_at)}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl btn-soft px-3 py-2 text-xs font-semibold"
                      onClick={() => void lookup(activeUser.discord_user_id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      상세 새로고침
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-[color:var(--accent-pink)]" />
                      <h3 className="text-sm font-semibold">포인트</h3>
                    </div>
                    <p className="mt-1 text-xs muted">현재 잔액: {balance.toLocaleString()}p</p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {quickDeltaPresets.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            Number(deltaPoints) === preset
                              ? 'border border-[color:var(--accent-pink)]/60 bg-[color:var(--accent-pink)]/16 text-[color:var(--fg)]'
                              : 'btn-soft'
                          }`}
                          onClick={() => setDeltaPoints(String(preset))}
                        >
                          {preset}p
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3">
                      <div className="text-[11px] font-semibold muted-2">빠른 조정</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          className="w-28 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm"
                          type="number"
                          min={1}
                          step={1}
                          value={deltaPoints}
                          onChange={(e) => setDeltaPoints(e.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded-lg btn-soft px-3 py-2 text-sm disabled:opacity-60"
                          onClick={() => void applyDelta(1)}
                          disabled={pointsBusy}
                        >
                          +적용
                        </button>
                        <button
                          type="button"
                          className="rounded-lg btn-soft px-3 py-2 text-sm disabled:opacity-60"
                          onClick={() => void applyDelta(-1)}
                          disabled={pointsBusy}
                        >
                          -적용
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3">
                      <div className="text-[11px] font-semibold muted-2">잔액 설정</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          className="w-36 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm"
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
                          className="rounded-lg btn-bangul px-3 py-2 text-sm font-semibold disabled:opacity-60"
                          onClick={() => void applySet()}
                          disabled={pointsBusy}
                        >
                          설정 반영
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                    <h3 className="text-sm font-semibold">장착 관리</h3>
                    <p className="mt-1 text-xs muted">장착 아이템: {equippedItemId ?? '없음'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl btn-soft px-3 py-2 text-sm"
                        onClick={() => void setEquipped(activeUser.discord_user_id, null)}
                      >
                        장착 해제
                      </button>
                      {roleItems.slice(0, 10).map((it) => (
                        <button
                          key={it.item_id}
                          type="button"
                          className={`rounded-xl px-3 py-2 text-sm transition ${
                            equippedItemId === it.item_id ? 'border border-[color:var(--accent-pink)]/60 bg-[color:var(--accent-pink)]/14' : 'btn-soft'
                          }`}
                          onClick={() => void setEquipped(activeUser.discord_user_id, it.item_id)}
                        >
                          {it.name}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] muted-2">역할 적용은 봇 워커가 처리합니다. 권한/계층 문제로 실패할 수 있습니다.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[color:var(--accent-pink)]" />
                      <h3 className="text-sm font-semibold">역할 관리</h3>
                    </div>
                    <p className="text-xs muted">보유 역할: {assignedRoles.length}</p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {assignedRoles.length === 0 ? (
                      <span className="text-xs muted">관리 가능한 보유 역할이 없습니다.</span>
                    ) : (
                      assignedRoles.map((role) => (
                        <span key={`assigned-${role.id}`} className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2.5 py-1 text-[11px]">
                          {role.name}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="mt-3 relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]" />
                    <input
                      className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] py-2 pl-9 pr-3 text-sm"
                      placeholder="역할 검색"
                      value={roleSearchText}
                      onChange={(e) => setRoleSearchText(e.target.value)}
                    />
                  </div>

                  <div className="mt-3 grid max-h-[260px] gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredGuildRoles.length === 0 ? (
                      <div className="text-xs muted">조건에 맞는 역할이 없습니다.</div>
                    ) : (
                      filteredGuildRoles.map((role) => {
                        const active = memberRoleIds.includes(role.id);
                        return (
                          <button
                            key={role.id}
                            type="button"
                            className={`rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-60 ${
                              active
                                ? 'border-[color:var(--accent-pink)]/50 bg-[color:var(--accent-pink)]/10'
                                : 'border-[color:var(--border)] bg-[color:var(--chip)] hover:bg-[color:var(--card)]'
                            }`}
                            onClick={() => void toggleRole(role.id)}
                            disabled={rolesBusy}
                          >
                            <div className="font-semibold truncate">{role.name}</div>
                            <div className="mt-0.5 text-[11px] muted-2">{active ? '부여됨 · 클릭 시 해제' : '미부여 · 클릭 시 부여'}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                  <h3 className="text-sm font-semibold">인벤토리 수량</h3>
                  <p className="mt-1 text-xs muted">수량 입력 후 포커스를 벗어나면 저장됩니다.</p>

                  <div className="mt-3 relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]" />
                    <input
                      className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] py-2 pl-9 pr-3 text-sm"
                      placeholder="아이템 검색"
                      value={inventorySearchText}
                      onChange={(e) => setInventorySearchText(e.target.value)}
                    />
                  </div>

                  <div className="mt-3 grid max-h-[340px] gap-2 overflow-auto pr-1 sm:grid-cols-2">
                    {filteredRoleItems.length === 0 ? (
                      <div className="text-xs muted">조건에 맞는 아이템이 없습니다.</div>
                    ) : (
                      filteredRoleItems.map((it) => {
                        const qty = invMap.get(it.item_id) ?? 0;
                        return (
                          <div key={it.item_id} className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{it.name}</div>
                              <div className="text-[11px] muted-2">{it.item_id}</div>
                            </div>
                            <input
                              className="w-24 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-2 py-1 text-sm"
                              type="number"
                              min={0}
                              value={qty}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setInv((prev) => {
                                  const next = prev.filter((r) => r.item_id !== it.item_id);
                                  next.unshift({ item_id: it.item_id, qty: Number.isFinite(v) ? v : 0, items: it });
                                  return next;
                                });
                              }}
                              onBlur={(e) => void setInventoryQty(activeUser.discord_user_id, it.item_id, Number(e.target.value))}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] px-4 py-10 text-center text-sm muted">
                상세 정보가 없습니다.
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
