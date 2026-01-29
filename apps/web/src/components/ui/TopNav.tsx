import Link from 'next/link';

import ThemeToggle from '@/components/theme/ThemeToggle';

export default function TopNav(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
        <h1 className="mt-3 truncate text-2xl font-semibold tracking-tight text-[color:var(--fg)] font-bangul">{props.title}</h1>
        {props.subtitle ? <p className="mt-1 text-sm muted">{props.subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link className="rounded-xl btn-soft px-3 py-2 text-sm" href="/">
          홈
        </Link>
        {props.right}
      </div>
    </header>
  );
}
