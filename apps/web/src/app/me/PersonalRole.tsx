'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Crown,
  ImagePlus,
  Loader2,
  Palette,
  PenLine,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

export type ColorType = 'solid' | 'gradient' | 'hologram';

export type PersonalRoleData = {
  id: string;
  name: string;
  color: number;
  colorType: ColorType;
  colorSecondary: number;
  iconUrl: string | null;
};

type Props = {
  isBoosting: boolean;
  initialRole: PersonalRoleData | null;
  userName: string;
  userAvatarUrl: string | null;
};

// ── Colour helpers ───────────────────────────────────────────

function intToHex(n: number): string {
  if (n === 0) return '#99aab5'; // Discord default grey
  return '#' + n.toString(16).padStart(6, '0');
}
function hexToInt(hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  return isNaN(v) ? 0 : v;
}

// Fixed holographic colours (enforced by Discord)
const HOLOGRAM_PRIMARY = 11127295;   // #a9c6ff
const HOLOGRAM_SECONDARY = 16759788; // #ffdfec
const HOLOGRAM_TERTIARY = 16761760;  // #ffe7a0

const PRESET_COLORS = [
  '#ff5fa2', '#bca7ff', '#78b7ff', '#39d3b3', '#ffd36a',
  '#e91e63', '#9c27b0', '#5865f2', '#43b581', '#faa61a', '#f04747',
  '#ffb3c6', '#c9b1ff', '#a0d2ff', '#b5ead7', '#fff1b8', '#ffc3a0',
  '#831843', '#4c1d95', '#1e3a5f', '#064e3b', '#78350f', '#7f1d1d',
];

const COLOR_TYPE_META: Record<ColorType, { label: string; desc: string }> = {
  solid: { label: '단색', desc: '하나의 색상으로 역할을 표시해요.' },
  gradient: { label: '그라데이션', desc: '두 색상이 부드럽게 섞여 표시돼요.' },
  hologram: { label: '홀로그램', desc: '디스코드 고정 홀로그램 효과가 적용돼요.' },
};

// ── Component ────────────────────────────────────────────────

export default function PersonalRole({ isBoosting, initialRole, userName, userAvatarUrl }: Props) {
  const [role, setRole] = useState<PersonalRoleData | null>(initialRole);
  const [name, setName] = useState(initialRole?.name ?? '');
  const [colorType, setColorType] = useState<ColorType>(initialRole?.colorType ?? 'solid');
  const [color1, setColor1] = useState(initialRole ? intToHex(initialRole.color) : '#ff5fa2');
  const [color2, setColor2] = useState(initialRole ? intToHex(initialRole.colorSecondary) : '#78b7ff');
  const [iconPreview, setIconPreview] = useState<string | null>(initialRole?.iconUrl ?? null);
  const [iconData, setIconData] = useState<string | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);

  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTarget, setActiveTarget] = useState<1 | 2>(1);
  const [open, setOpen] = useState(!initialRole); // collapsed when role exists

  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string, ok: boolean) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (role) {
      setName(role.name);
      setColorType(role.colorType);
      setColor1(intToHex(role.color));
      setColor2(intToHex(role.colorSecondary));
      setIconPreview(role.iconUrl);
      setIconData(null);
      setRemoveIcon(false);
    }
  }, [role]);

  const activeColor = activeTarget === 1 ? color1 : color2;
  const setActiveColor = activeTarget === 1 ? setColor1 : setColor2;

  const hasChanges = role && (
    name !== role.name ||
    colorType !== role.colorType ||
    hexToInt(color1) !== role.color ||
    hexToInt(color2) !== role.colorSecondary ||
    iconData !== null ||
    removeIcon
  );

  // ── Preview helpers ──────────────────────────────────────

  function previewDotStyle(): React.CSSProperties {
    if (colorType === 'hologram') {
      return {
        background: `linear-gradient(135deg, ${intToHex(HOLOGRAM_PRIMARY)}, ${intToHex(HOLOGRAM_SECONDARY)}, ${intToHex(HOLOGRAM_TERTIARY)})`,
      };
    }
    if (colorType === 'gradient') {
      return { background: `linear-gradient(135deg, ${color1}, ${color2})` };
    }
    return { background: color1 };
  }

  function previewTextColor(): string {
    if (colorType === 'hologram') return intToHex(HOLOGRAM_PRIMARY);
    return color1;
  }

  // ── Create ─────────────────────────────────────────────

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/me/personal-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          color: hexToInt(color1),
          colorType,
          colorSecondary: hexToInt(color2),
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? '생성 실패', false); return; }
      setRole(data.role);
      showToast('개인역할이 생성되었어요!', true);
    } catch { showToast('네트워크 오류가 발생했어요.', false); }
    finally { setCreating(false); }
  }

  // ── Save ───────────────────────────────────────────────

  async function handleSave() {
    if (!role || !hasChanges) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (name !== role.name) body.name = name;
      if (hexToInt(color1) !== role.color) body.color = hexToInt(color1);
      if (colorType !== role.colorType) body.colorType = colorType;
      if (hexToInt(color2) !== role.colorSecondary) body.colorSecondary = hexToInt(color2);
      if (iconData) body.icon = iconData;
      else if (removeIcon) body.icon = null;

      const res = await fetch('/api/me/personal-role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? '저장 실패', false); return; }
      setRole(data.role);
      showToast('저장되었어요!', true);
    } catch { showToast('네트워크 오류가 발생했어요.', false); }
    finally { setSaving(false); }
  }

  // ── Icon upload ────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) { showToast('이미지는 64KB 이하여야 해요.', false); return; }
    if (file.type !== 'image/png') { showToast('PNG 이미지만 업로드할 수 있어요.', false); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setIconPreview(reader.result as string);
      setIconData(reader.result as string);
      setRemoveIcon(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function resetForm() {
    if (!role) return;
    setName(role.name);
    setColorType(role.colorType);
    setColor1(intToHex(role.color));
    setColor2(intToHex(role.colorSecondary));
    setIconPreview(role.iconUrl);
    setIconData(null);
    setRemoveIcon(false);
  }

  // ────────────────────────────────────────────────────────
  // Non-booster
  // ────────────────────────────────────────────────────────

  if (!isBoosting) {
    return (
      <article data-me-scroll-reveal className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-5">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-[color:var(--accent-pink)]" />
          <h2 className="text-base font-semibold font-bangul text-[color:var(--fg)]">개인역할</h2>
        </div>
        <div className="mt-3 rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color:var(--chip)] px-5 py-8 text-center">
          <Crown className="mx-auto h-8 w-8 text-[color:var(--muted)]" />
          <p className="mt-3 text-sm muted">서버 부스트를 하면 나만의 역할을 만들 수 있어요!</p>
          <p className="mt-1 text-xs muted-2">이름, 색상, 아이콘을 자유롭게 커스텀할 수 있어요.</p>
        </div>
      </article>
    );
  }

  // ── Shared UI pieces ───────────────────────────────────

  const currentIconUrl = removeIcon ? null : iconPreview;

  const now = new Date();
  const previewTime = `오늘 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const discordPreview = (
    <div className="overflow-hidden rounded-2xl border border-[#1e1f22]" style={{ background: '#313338' }}>
      {/* Chat message */}
      <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-[#2e3035]">
        {/* Avatar */}
        <div className="shrink-0 pt-0.5">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt="" className="h-10 w-10 rounded-full" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-[#5865f2]" />
          )}
        </div>

        {/* Message content */}
        <div className="min-w-0 flex-1">
          {/* Name + role icon + timestamp */}
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold leading-tight" style={{ color: previewTextColor() }}>
              {userName}
            </span>
            {currentIconUrl && (
              <img src={currentIconUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
            )}
            <span className="ml-1 text-[11px] leading-tight" style={{ color: '#949ba4' }}>
              {previewTime}
            </span>
          </div>

          {/* Message text */}
          <div className="mt-0.5 text-sm" style={{ color: '#dbdee1' }}>
            개인역할 미리보기에요!
          </div>
        </div>
      </div>
    </div>
  );

  const colorTypeSelector = (
    <div className="flex gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] p-1">
      {(['solid', 'gradient', 'hologram'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => { setColorType(t); setActiveTarget(1); }}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            colorType === t
              ? 'bg-[color:var(--accent-pink)] text-white shadow-sm'
              : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
          }`}
        >
          {COLOR_TYPE_META[t].label}
        </button>
      ))}
    </div>
  );

  const colorPicker = (
    <div className="space-y-3 mt-3">
      <p className="text-xs muted">{COLOR_TYPE_META[colorType].desc}</p>

      {colorType === 'hologram' && (
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3">
          <div
            className="h-8 w-16 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${intToHex(HOLOGRAM_PRIMARY)}, ${intToHex(HOLOGRAM_SECONDARY)}, ${intToHex(HOLOGRAM_TERTIARY)})`,
            }}
          />
          <div className="text-xs muted-2">디스코드에서 고정된 홀로그램 색상이 적용돼요.</div>
        </div>
      )}

      {colorType !== 'hologram' && (
        <>
          {colorType === 'gradient' && (
            <div className="flex items-center gap-2">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setActiveTarget(n)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                    activeTarget === n
                      ? 'border-[color:var(--accent-pink)] bg-[color:var(--accent-pink)]/10 text-[color:var(--accent-pink)]'
                      : 'border-[color:var(--border)] text-[color:var(--muted)]'
                  }`}
                >
                  <div className="h-4 w-4 rounded-full border border-white/20" style={{ background: n === 1 ? color1 : color2 }} />
                  색상 {n}
                </button>
              ))}
              <div
                className="ml-auto h-6 w-16 rounded-lg border border-[color:var(--border)]"
                style={{ background: `linear-gradient(90deg, ${color1}, ${color2})` }}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveColor(c)}
                className="relative h-7 w-7 rounded-full transition-transform hover:scale-110 active:scale-95"
                style={{ background: c }}
              >
                {activeColor.toLowerCase() === c.toLowerCase() && (
                  <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="color"
                value={activeColor}
                onChange={(e) => setActiveColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[color:var(--border)]" style={{ background: activeColor }}>
                <Palette className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
              </div>
            </div>
            <input
              type="text"
              value={activeColor}
              onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setActiveColor(e.target.value); }}
              maxLength={7}
              className="w-24 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-1.5 text-xs font-mono text-[color:var(--fg)] outline-none transition-colors focus:border-[color:var(--accent-pink)]"
            />
          </div>
        </>
      )}
    </div>
  );

  const iconUpload = (
    <div>
      <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={handleFileChange} />
      <div className="flex items-center gap-3">
        {iconPreview && !removeIcon ? (
          <div className="relative group">
            <img src={iconPreview} alt="" className="h-16 w-16 rounded-2xl border border-[color:var(--border)] object-cover" />
            <button
              type="button"
              onClick={() => { setRemoveIcon(true); setIconPreview(null); setIconData(null); }}
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--muted)] transition-all hover:border-[color:var(--accent-pink)] hover:text-[color:var(--accent-pink)] hover:bg-[color:var(--accent-pink)]/5"
          >
            <ImagePlus className="h-6 w-6" />
          </button>
        )}
        <div className="space-y-1">
          <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-[color:var(--accent-pink)] hover:underline">
            {iconPreview && !removeIcon ? '이미지 변경' : '이미지 업로드'}
          </button>
          <p className="text-[10px] muted-2">PNG · 최대 64KB</p>
          <p className="text-[10px] muted-2">서버 부스트 레벨 2 이상 필요</p>
        </div>
      </div>
    </div>
  );

  // ── Collapsed header (shared for create / edit) ─────────

  const header = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex w-full items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-[color:var(--accent-pink)]" />
        <h2 className="text-base font-semibold font-bangul text-[color:var(--fg)]">
          {role ? '개인역할' : '개인역할 만들기'}
        </h2>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Compact role preview when collapsed */}
        {role && !open && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2.5 py-1">
            {currentIconUrl ? (
              <img src={currentIconUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
            ) : (
              <div className="h-3 w-3 shrink-0 rounded-full" style={previewDotStyle()} />
            )}
            <span className="text-xs font-semibold" style={{ color: previewTextColor() }}>
              {role.name}
            </span>
          </div>
        )}
        <m.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
        </m.div>
      </div>
    </button>
  );

  // ── Create mode ────────────────────────────────────────

  if (!role) {
    return (
      <article data-me-scroll-reveal className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-5">
        {header}
        <AnimatePresence initial={false}>
          {open && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-5 pt-5">
                {discordPreview}
                <Section icon={<PenLine className="h-3.5 w-3.5" />} label="이름">
                  <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="내 역할"
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3.5 py-2.5 text-sm text-[color:var(--fg)] outline-none transition-colors focus:border-[color:var(--accent-pink)]" />
                </Section>
                <Section icon={<Palette className="h-3.5 w-3.5" />} label="색상">
                  {colorTypeSelector}
                  {colorPicker}
                </Section>
                <Section icon={<ImagePlus className="h-3.5 w-3.5" />} label="역할 아이콘">
                  {iconUpload}
                </Section>
                <m.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleCreate} disabled={creating}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl btn-bangul px-4 py-3.5 text-sm font-semibold shadow-lg disabled:opacity-60">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  역할 생성
                </m.button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
        <Toast toast={toast} />
      </article>
    );
  }

  // ── Edit mode ──────────────────────────────────────────

  return (
    <article data-me-scroll-reveal className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-5">
      {header}

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-5">
              {discordPreview}

              <div className="mt-5 space-y-6">
                <Section icon={<PenLine className="h-3.5 w-3.5" />} label="이름">
                  <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="역할 이름"
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3.5 py-2.5 text-sm text-[color:var(--fg)] outline-none transition-colors focus:border-[color:var(--accent-pink)]" />
                  <div className="mt-1 text-right text-[10px] muted-2">{name.length}/100</div>
                </Section>

                <Section icon={<Palette className="h-3.5 w-3.5" />} label="색상">
                  {colorTypeSelector}
                  {colorPicker}
                </Section>

                <Section icon={<ImagePlus className="h-3.5 w-3.5" />} label="역할 아이콘">
                  {iconUpload}
                </Section>
              </div>

              <AnimatePresence>
                {hasChanges && (
                  <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-6 flex gap-2">
                    <button type="button" onClick={resetForm}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-xs font-semibold text-[color:var(--muted)] transition-colors hover:text-[color:var(--fg)]">
                      <RotateCcw className="h-3.5 w-3.5" />
                      초기화
                    </button>
                    <m.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSave} disabled={saving}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold shadow-lg disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      변경사항 저장
                    </m.button>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </article>
  );
}

// ── Sub-components ────────────────────────────────────────

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="muted">{icon}</span>
        <span className="text-xs font-semibold muted-2">{label}</span>
      </div>
      {children}
    </section>
  );
}

function Toast({ toast }: { toast: { msg: string; ok: boolean } | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          className={`mt-3 rounded-xl px-4 py-2.5 text-xs font-semibold ${
            toast.ok
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/15 text-red-400 border border-red-500/20'
          }`}>
          {toast.msg}
        </m.div>
      )}
    </AnimatePresence>
  );
}
