import React from 'react';

export default function BangulCat(props: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={props.title ?? '고양이와 방울 일러스트'}
    >
      <defs>
        <linearGradient id="bg" x1="20" y1="10" x2="220" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent-mint)" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="var(--accent-sky)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--accent-pink)" stopOpacity="0.28" />
        </linearGradient>
      </defs>

      <path
        d="M28 104c0-44 36-80 92-80 58 0 92 36 92 80 0 42-31 78-92 78-61 0-92-36-92-78Z"
        fill="url(#bg)"
      />

      {/* Ears */}
      <path d="M72 42 56 16 38 54c10-6 22-10 34-12Z" fill="var(--card)" stroke="var(--border)" />
      <path d="M168 42 184 16 202 54c-10-6-22-10-34-12Z" fill="var(--card)" stroke="var(--border)" />

      {/* Face */}
      <path
        d="M60 104c0-34 28-62 60-62s60 28 60 62c0 32-22 60-60 60s-60-28-60-60Z"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="2"
      />

      {/* Eyes */}
      <path d="M92 100c0-6 5-11 11-11 7 0 12 5 12 11" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />
      <path d="M125 100c0-6 5-11 11-11 7 0 12 5 12 11" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />

      {/* Nose + mouth */}
      <path d="M118 108c2-2 5-2 7 0" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />
      <path d="M121 110c0 7-6 10-12 10" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />
      <path d="M122 110c0 7 6 10 12 10" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />

      {/* Cheeks */}
      <circle cx="78" cy="114" r="8" fill="var(--accent-pink)" fillOpacity="0.25" />
      <circle cx="162" cy="114" r="8" fill="var(--accent-pink)" fillOpacity="0.25" />

      {/* Bell */}
      <g transform="translate(112 146)">
        <path
          d="M8 2c8 0 14 6 14 14 0 9-5 18-14 18S-6 25-6 16C-6 8 0 2 8 2Z"
          fill="var(--accent-lemon)"
          fillOpacity="0.95"
          stroke="color-mix(in srgb, var(--fg) 18%, transparent)"
        />
        <path d="M0 14h16" stroke="color-mix(in srgb, var(--fg) 22%, transparent)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="20" r="2.6" fill="color-mix(in srgb, var(--fg) 34%, transparent)" />
      </g>

      {/* Bubbles */}
      <circle cx="44" cy="70" r="8" fill="var(--accent-sky)" fillOpacity="0.22" />
      <circle cx="206" cy="82" r="10" fill="var(--accent-mint)" fillOpacity="0.20" />
      <circle cx="188" cy="132" r="6" fill="var(--accent-pink)" fillOpacity="0.18" />
    </svg>
  );
}
