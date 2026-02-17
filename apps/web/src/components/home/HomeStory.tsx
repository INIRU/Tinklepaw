'use client';

import Image from 'next/image';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef } from 'react';

import MarkdownPreview from '@/components/content/MarkdownPreview';
import HomeActionGrid from '@/components/home/HomeActionGrid';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function HomeStory(props: {
  bannerSrc: string;
  intro: string | null;
  showAdminEdit: boolean;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const mediaSectionRef = useRef<HTMLElement | null>(null);
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);
  const mediaImageRef = useRef<HTMLDivElement | null>(null);
  const mediaCaptionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    const mediaSection = mediaSectionRef.current;
    const mediaFrame = mediaFrameRef.current;
    const mediaImage = mediaImageRef.current;
    const mediaCaption = mediaCaptionRef.current;

    if (!root || !hero || !mediaSection || !mediaFrame || !mediaImage || !mediaCaption) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const ctx = gsap.context(() => {
      const titleLines = hero.querySelectorAll<HTMLElement>('[data-hero-line]');

      gsap.set(titleLines, { autoAlpha: 0, yPercent: 20, filter: 'blur(6px)' });

      gsap.to(titleLines, {
        autoAlpha: 1,
        yPercent: 0,
        filter: 'blur(0px)',
        duration: 0.92,
        stagger: 0.08,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top 92%',
          end: 'top 58%',
          scrub: 0.74,
        },
      });

      gsap.fromTo(
        '[data-home-soft]',
        { autoAlpha: 0, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.56,
          stagger: 0.08,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: hero,
            start: 'top 86%',
          },
        }
      );

      gsap.fromTo(
        mediaFrame,
        {
          clipPath: 'inset(0% 24% 0% 24% round 30px)',
          scale: 0.93,
        },
        {
          clipPath: 'inset(0% 0% 0% 0% round 22px)',
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: mediaSection,
            start: 'top 78%',
            end: '+=780',
            scrub: 0.86,
          },
        }
      );

      gsap.fromTo(
        mediaImage,
        { scale: 1.08, yPercent: -3 },
        {
          scale: 1,
          yPercent: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: mediaSection,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.9,
          },
        }
      );

      gsap.fromTo(
        mediaCaption,
        { autoAlpha: 0, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: mediaSection,
            start: 'top 62%',
            end: '+=260',
            scrub: 0.7,
          },
        }
      );
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <main ref={rootRef} className="mx-auto max-w-6xl px-6 pb-20 pt-8">
      <section ref={heroRef} className="mx-auto flex min-h-[72vh] max-w-5xl flex-col justify-center sm:min-h-[80vh]">
        <div className="grid gap-7 lg:grid-cols-[1.08fr,0.92fr] lg:items-end">
          <div>
            <h1 className="mt-4 text-5xl font-black tracking-tight font-bangul text-[color:var(--fg)] sm:text-7xl lg:text-8xl">
              <span data-hero-line className="block">
                조용히 있어도,
              </span>
              <span data-hero-line className="block">
                충분한 서버.
              </span>
            </h1>

            <p data-home-soft className="mt-5 max-w-2xl text-sm leading-relaxed text-[color:var(--muted)] sm:text-base">
              잠수만 타도 괜찮고, 말하고 싶은 날에만 천천히 다가와도 괜찮아요.
              부담 없이 오래 머무를 수 있는 분위기를 가장 먼저 생각했어요.
            </p>
          </div>

          <aside
            data-home-soft
            className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-5 shadow-[0_14px_34px_rgba(8,12,24,0.1)]"
          >
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[color:var(--muted)]">THIS SERVER FEELS EASY</p>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[color:var(--fg)]">
              말하지 않는 시간도 자연스럽고, 참여하고 싶은 날엔 가볍게 섞일 수 있어요.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[color:var(--muted)]">
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2.5 py-1">잠수 환영</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2.5 py-1">부담 없는 대화</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2.5 py-1">느린 페이스 존중</span>
            </div>
          </aside>
        </div>
      </section>

      <section ref={mediaSectionRef} className="relative h-[108svh] sm:h-[124svh] lg:h-[138svh]">
        <div className="sticky top-[calc(64px+env(safe-area-inset-top))]">
          <div
            ref={mediaFrameRef}
            className="relative mx-auto max-w-5xl overflow-hidden rounded-[22px] border border-[color:var(--border)] bg-[color:var(--card)] shadow-[0_24px_56px_rgba(7,12,24,0.2)]"
          >
            <div ref={mediaImageRef} className="relative aspect-[16/9]">
              <Image src={props.bannerSrc} alt="방울냥 서버 배너" fill priority className="object-cover" />
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,24,0)_45%,rgba(7,11,24,0.4)_100%)]" />

            <div
              ref={mediaCaptionRef}
              className="absolute bottom-4 left-4 right-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--fg)_16%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_82%,transparent)] px-4 py-3 backdrop-blur"
            >
              <p className="text-xs font-semibold text-[color:var(--fg)] sm:text-sm">
                말하고 싶은 날엔 가까이, 쉬고 싶은 날엔 조용히.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-6 grid max-w-5xl gap-6 border-t border-[color:color-mix(in_srgb,var(--fg)_10%,transparent)] pt-8 sm:grid-cols-3">
        <article data-home-soft>
          <h2 className="text-sm font-bold font-bangul text-[color:var(--fg)]">잠수 환영</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">눈팅만 해도 충분해요.</p>
        </article>
        <article data-home-soft>
          <h2 className="text-sm font-bold font-bangul text-[color:var(--fg)]">가벼운 참여</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">하고 싶은 날만 천천히.</p>
        </article>
        <article data-home-soft>
          <h2 className="text-sm font-bold font-bangul text-[color:var(--fg)]">편한 무드</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">부담 없이 오래 머무는 공간.</p>
        </article>
      </section>

      {props.intro ? (
        <section data-home-soft className="mt-6 rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_92%,transparent)] p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold font-bangul sm:text-lg">서버 소개</h2>
            {props.showAdminEdit ? (
              <Link className="rounded-full btn-soft px-2.5 py-1 text-[10px] font-semibold sm:text-xs" href="/admin/settings">
                수정
              </Link>
            ) : null}
          </div>
          <div className="mt-2.5">
            <MarkdownPreview content={props.intro} />
          </div>
        </section>
      ) : null}

      <HomeActionGrid />
    </main>
  );
}
