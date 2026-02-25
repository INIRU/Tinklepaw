'use client';

import Image from 'next/image';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef } from 'react';
import { ArrowDown } from 'lucide-react';

import MarkdownPreview from '@/components/content/MarkdownPreview';
import HomeActionGrid from '@/components/home/HomeActionGrid';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/* ── Static data ──────────────────────────────────────────── */

const PHILOSOPHY =
  '말하지 않는 시간도 자연스럽고, 참여하고 싶은 날엔 가볍게 섞일 수 있어요. 부담 없이 오래 머무를 수 있는 분위기를 가장 먼저 생각했어요.';

const CHANNELS: { emoji: string; name: string; desc: string; accent: string }[] = [
  { emoji: '💬', name: '자유잡담', desc: '가볍게 수다 떨고, 일상을 나눠요.\n말 안 해도 눈팅만으로 충분해요.', accent: 'var(--accent-pink)' },
  { emoji: '🎵', name: '음악감상', desc: '좋아하는 노래를 함께 들어요.\n음악봇으로 실시간 감상.', accent: 'var(--accent-sky)' },
  { emoji: '🎲', name: '캐릭터 뽑기', desc: '멋진 연출과 함께 역할 아이템을 뽑아봐.\nSSS 등급에 도전!', accent: 'var(--accent-lavender)' },
  { emoji: '🏆', name: '잭팟', desc: '복권으로 대박의 꿈을.\n누적금이 쌓일수록 기대감도 커져요.', accent: 'var(--accent-lemon)' },
  { emoji: '⚒️', name: '아이템 강화', desc: '참치캔을 강화하고 포인트로 판매.\n운과 전략의 콘텐츠.', accent: 'var(--accent-mint)' },
];

const VALUES: { emoji: string; title: string; desc: string; accent: string }[] = [
  { emoji: '🌙', title: '잠수 환영', desc: '눈팅만 해도 충분해요. 조용한 시간도 자연스러워요.', accent: 'var(--accent-pink)' },
  { emoji: '☁️', title: '가벼운 참여', desc: '하고 싶은 날만 천천히. 부담 없는 대화가 이어져요.', accent: 'var(--accent-sky)' },
  { emoji: '🍵', title: '편한 무드', desc: '부담 없이 오래 머무는 공간. 느린 페이스가 존중받아요.', accent: 'var(--accent-lavender)' },
];

/* ── Component ────────────────────────────────────────────── */

export default function HomeStory(props: {
  bannerSrc: string;
  intro: string | null;
  showAdminEdit: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const textRevealRef = useRef<HTMLElement>(null);
  const bannerSectionRef = useRef<HTMLElement>(null);
  const bannerFrameRef = useRef<HTMLDivElement>(null);
  const bannerImageRef = useRef<HTMLDivElement>(null);
  const bannerCaptionRef = useRef<HTMLDivElement>(null);
  const channelSectionRef = useRef<HTMLElement>(null);
  const channelTrackRef = useRef<HTMLDivElement>(null);
  const valuesSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const ctx = gsap.context(() => {
      /* ── Hero intro timeline ────────────────────────── */
      const tl = gsap.timeline({ delay: 0.15 });

      tl.fromTo(
        '[data-hero-title]',
        { autoAlpha: 0, y: 50, scale: 0.92 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 1.4, ease: 'power3.out' },
      );
      tl.fromTo(
        '[data-hero-sub]',
        { autoAlpha: 0, y: 30, filter: 'blur(10px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out' },
        '-=0.7',
      );
      tl.fromTo(
        '[data-hero-desc]',
        { autoAlpha: 0, y: 20 },
        { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' },
        '-=0.5',
      );
      tl.fromTo(
        '[data-hero-scroll]',
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.5 },
        '-=0.2',
      );

      /* Hero blobs float */
      root.querySelectorAll('[data-hero-blob]').forEach((blob, i) => {
        gsap.to(blob, {
          y: 'random(-25, 25)',
          x: 'random(-20, 20)',
          duration: 'random(4, 6)',
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.6,
        });
      });

      /* Hero pin + layered fade-out on scroll */
      const heroTl = gsap.timeline({
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: '+=80%',
          pin: true,
          scrub: true,
        },
      });

      // scroll cue disappears first
      heroTl.to('[data-hero-scroll]', { autoAlpha: 0, duration: 0.15 }, 0);

      // content rises, blurs, fades
      heroTl.to('[data-hero-content]', {
        y: -50,
        autoAlpha: 0,
        scale: 0.97,
        filter: 'blur(8px)',
        duration: 0.6,
      }, 0.05);

      // background + blobs fade last
      heroTl.to('[data-hero-bg]', { autoAlpha: 0, duration: 0.5 }, 0.3);
      heroTl.to('[data-hero-blob]', { autoAlpha: 0, duration: 0.4 }, 0.3);

      /* ── Text reveal (word-by-word) ─────────────────── */
      const words = root.querySelectorAll('[data-reveal-word]');
      if (words.length > 0 && textRevealRef.current) {
        gsap.fromTo(
          words,
          { autoAlpha: 0.1, filter: 'blur(4px)' },
          {
            autoAlpha: 1,
            filter: 'blur(0px)',
            stagger: 0.06,
            ease: 'none',
            scrollTrigger: {
              trigger: textRevealRef.current,
              start: 'top 75%',
              end: 'bottom 55%',
              scrub: 0.4,
            },
          },
        );
      }

      /* ── Banner cinematic ───────────────────────────── */
      const bannerFrame = bannerFrameRef.current;
      const bannerImage = bannerImageRef.current;
      const bannerCaption = bannerCaptionRef.current;
      const bannerSection = bannerSectionRef.current;

      if (bannerSection && bannerFrame && bannerImage) {
        gsap.fromTo(
          bannerFrame,
          { clipPath: 'inset(8% 30% 8% 30% round 32px)', scale: 0.88 },
          {
            clipPath: 'inset(0% 0% 0% 0% round 22px)',
            scale: 1,
            ease: 'none',
            scrollTrigger: { trigger: bannerSection, start: 'top 80%', end: '+=900', scrub: 0.86 },
          },
        );

        gsap.fromTo(
          bannerImage,
          { scale: 1.15, yPercent: -5 },
          {
            scale: 1,
            yPercent: 0,
            ease: 'none',
            scrollTrigger: { trigger: bannerSection, start: 'top bottom', end: 'bottom top', scrub: 0.9 },
          },
        );

        if (bannerCaption) {
          gsap.fromTo(
            bannerCaption,
            { autoAlpha: 0, y: 24 },
            {
              autoAlpha: 1,
              y: 0,
              ease: 'none',
              scrollTrigger: { trigger: bannerSection, start: 'top 45%', end: '+=320', scrub: 0.7 },
            },
          );
        }
      }

      /* ── Channel heading fade-in ────────────────────── */
      gsap.fromTo(
        '[data-channel-heading]',
        { autoAlpha: 0, y: 30 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: channelSectionRef.current, start: 'top 80%' },
        },
      );

      /* Channel horizontal scroll — desktop only */
      const channelSection = channelSectionRef.current;
      const channelTrack = channelTrackRef.current;
      const isWide = window.innerWidth >= 640;

      if (isWide && channelSection && channelTrack) {
        const totalWidth = channelTrack.scrollWidth - channelSection.clientWidth;
        if (totalWidth > 0) {
          gsap.to(channelTrack, {
            x: -totalWidth,
            ease: 'none',
            scrollTrigger: {
              trigger: channelSection,
              pin: true,
              scrub: 1,
              end: () => `+=${totalWidth + 100}`,
              invalidateOnRefresh: true,
            },
          });
        }
      }

      /* Channel cards — mobile stagger */
      if (!isWide) {
        gsap.fromTo(
          '[data-channel-card]',
          { autoAlpha: 0, y: 24, scale: 0.96 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            stagger: 0.09,
            ease: 'power3.out',
            scrollTrigger: { trigger: channelSectionRef.current, start: 'top 78%' },
          },
        );
      }

      /* ── Values stagger ─────────────────────────────── */
      if (valuesSectionRef.current) {
        gsap.fromTo(
          '[data-value-card]',
          { autoAlpha: 0, y: 40, scale: 0.94 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: { trigger: valuesSectionRef.current, start: 'top 78%' },
          },
        );
      }

      /* ── Intro section fade-in ──────────────────────── */
      const introEl = root.querySelector('[data-intro-section]');
      if (introEl) {
        gsap.fromTo(
          introEl,
          { autoAlpha: 0, y: 30 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: 'power3.out',
            scrollTrigger: { trigger: introEl, start: 'top 80%' },
          },
        );
      }
    }, root);

    return () => ctx.revert();
  }, []);

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div ref={rootRef}>
      {/* ── HERO ─────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative flex min-h-[100svh] items-center justify-center overflow-hidden"
      >
        {/* Background gradient — theme-aware */}
        <div
          data-hero-bg
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse at 30% 20%, color-mix(in srgb, var(--accent-pink) 14%, transparent), transparent 55%)',
              'radial-gradient(ellipse at 75% 55%, color-mix(in srgb, var(--accent-lavender) 12%, transparent), transparent 50%)',
              'radial-gradient(ellipse at 50% 85%, color-mix(in srgb, var(--accent-sky) 10%, transparent), transparent 48%)',
              'linear-gradient(180deg, color-mix(in srgb, var(--bg) 88%, var(--fg)) 0%, var(--bg) 100%)',
            ].join(', '),
          }}
        />

        {/* Ambient blobs — theme-aware */}
        <div
          data-hero-blob
          className="absolute left-[18%] top-[28%] h-72 w-72 rounded-full blur-[120px]"
          style={{ background: 'color-mix(in srgb, var(--accent-pink) 12%, transparent)' }}
        />
        <div
          data-hero-blob
          className="absolute bottom-[28%] right-[18%] h-56 w-56 rounded-full blur-[100px]"
          style={{ background: 'color-mix(in srgb, var(--accent-lavender) 12%, transparent)' }}
        />
        <div
          data-hero-blob
          className="absolute right-[32%] top-[18%] h-40 w-40 rounded-full blur-[80px]"
          style={{ background: 'color-mix(in srgb, var(--accent-sky) 10%, transparent)' }}
        />

        {/* Content */}
        <div data-hero-content className="relative z-10 px-6 text-center">
          <h1
            data-hero-title
            className="text-7xl font-black tracking-tight text-[color:var(--fg)] font-bangul sm:text-8xl lg:text-[10rem]"
          >
            방울냥
          </h1>
          <p
            data-hero-sub
            className="mt-5 text-xl font-medium text-[color:var(--muted)] font-bangul sm:text-2xl lg:text-3xl"
          >
            조용히 있어도, 충분한 서버.
          </p>
          <p data-hero-desc className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-[color:var(--muted-2)] sm:text-base">
            잠수만 타도 괜찮고, 말하고 싶은 날에만 천천히 다가와도 괜찮아요.
          </p>
        </div>

        {/* Scroll cue */}
        <div
          data-hero-scroll
          className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 text-[color:var(--muted-2)]"
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Scroll</span>
          <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
        </div>
      </section>

      {/* ── TEXT REVEAL ───────────────────────────────── */}
      <section ref={textRevealRef} className="relative px-6 py-28 sm:py-40">
        <p className="mx-auto max-w-4xl text-2xl font-bold leading-[1.6] text-[color:var(--fg)] font-bangul sm:text-4xl lg:text-5xl lg:leading-[1.5]">
          {PHILOSOPHY.split(' ').map((word, i) => (
            <span key={i} data-reveal-word className="mr-[0.3em] inline-block">
              {word}
            </span>
          ))}
        </p>
      </section>

      {/* ── BANNER CINEMATIC ──────────────────────────── */}
      <section ref={bannerSectionRef} className="relative h-[112svh] px-6 sm:h-[130svh] lg:h-[145svh]">
        <div className="sticky top-[calc(64px+env(safe-area-inset-top))]">
          <div
            ref={bannerFrameRef}
            className="relative mx-auto max-w-5xl overflow-hidden rounded-[22px] border border-[color:var(--border)] bg-[color:var(--card)] shadow-[0_28px_64px_rgba(7,12,24,0.22)]"
          >
            <div ref={bannerImageRef} className="relative aspect-[16/9]">
              <Image src={props.bannerSrc} alt="방울냥 서버 배너" fill priority className="object-cover" />
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,24,0)_40%,rgba(7,11,24,0.45)_100%)]" />

            <div
              ref={bannerCaptionRef}
              className="absolute inset-x-4 bottom-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--fg)_16%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_82%,transparent)] px-5 py-3.5 backdrop-blur-xl"
            >
              <p className="text-xs font-semibold text-[color:var(--fg)] sm:text-sm">
                말하고 싶은 날엔 가까이, 쉬고 싶은 날엔 조용히.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CHANNEL SHOWCASE ──────────────────────────── */}
      <section ref={channelSectionRef} className="relative overflow-hidden">
        <div className="flex flex-col justify-center py-16 sm:min-h-screen sm:py-0">
          {/* Heading */}
          <div data-channel-heading className="mb-8 px-6 sm:mb-10 lg:px-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-pink)]">
              Channels
            </p>
            <h2 className="mt-2 text-3xl font-bold text-[color:var(--fg)] font-bangul sm:text-4xl lg:text-5xl">
              이런 곳들이 있어요
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[color:var(--muted)]">
              다양한 채널에서 취향에 맞는 활동을 즐겨보세요.
            </p>
          </div>

          {/* Desktop: horizontal track */}
          <div ref={channelTrackRef} className="hidden gap-7 pl-6 sm:flex lg:pl-20">
            {CHANNELS.map((ch, i) => (
              <div
                key={i}
                data-channel-card
                className="group relative w-80 shrink-0 rounded-[28px] border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_94%,transparent)] p-7 backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_16px_48px_rgba(0,0,0,0.12)] lg:w-96"
              >
                <div className="mb-6 h-1 w-12 rounded-full" style={{ background: ch.accent }} />
                <span className="mb-4 block text-4xl">{ch.emoji}</span>
                <h3 className="text-xl font-bold text-[color:var(--fg)] font-bangul lg:text-2xl">{ch.name}</h3>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[color:var(--muted)]">
                  {ch.desc}
                </p>
                <div
                  className="pointer-events-none absolute -bottom-6 -right-6 h-28 w-28 rounded-full opacity-[0.08] blur-[40px] transition-opacity duration-300 group-hover:opacity-[0.15]"
                  style={{ background: ch.accent }}
                  aria-hidden="true"
                />
              </div>
            ))}
            <div className="w-20 shrink-0" aria-hidden="true" />
          </div>

          {/* Mobile: vertical stack */}
          <div className="flex flex-col gap-4 px-6 sm:hidden">
            {CHANNELS.map((ch, i) => (
              <div
                key={i}
                data-channel-card
                className="relative rounded-[22px] border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_94%,transparent)] p-5"
              >
                <div className="mb-3 h-0.5 w-8 rounded-full" style={{ background: ch.accent }} />
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{ch.emoji}</span>
                  <div>
                    <h3 className="text-base font-bold text-[color:var(--fg)] font-bangul">{ch.name}</h3>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[color:var(--muted)]">
                      {ch.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALUES ────────────────────────────────────── */}
      <section ref={valuesSectionRef} className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {VALUES.map((v, i) => (
            <article
              key={i}
              data-value-card
              className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${v.accent} 15%, transparent)` }}
              >
                <span className="text-xl">{v.emoji}</span>
              </div>
              <h3 className="text-base font-bold text-[color:var(--fg)] font-bangul">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">{v.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── SERVER INTRO ──────────────────────────────── */}
      {props.intro && (
        <section data-intro-section className="mx-auto max-w-5xl px-6 pb-8">
          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_92%,transparent)] p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold font-bangul sm:text-lg text-[color:var(--fg)]">서버 소개</h2>
              {props.showAdminEdit && (
                <Link
                  className="rounded-full btn-soft px-2.5 py-1 text-[10px] font-semibold sm:text-xs"
                  href="/admin/settings"
                >
                  수정
                </Link>
              )}
            </div>
            <div className="mt-3">
              <MarkdownPreview content={props.intro} />
            </div>
          </div>
        </section>
      )}

      {/* ── ACTION GRID ───────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-6 pb-20">
        <HomeActionGrid />
      </div>
    </div>
  );
}
