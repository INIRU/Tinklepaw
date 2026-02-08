import type { ReactNode } from 'react';
import { Activity, Clock3, Sparkles } from 'lucide-react';

type HoverStatusPopupProps = {
  title: string;
  statusLabel: string;
  timestamp?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function HoverStatusPopup({ title, statusLabel, timestamp, description, children, className }: HoverStatusPopupProps) {
  return (
    <span className={`group relative inline-flex ${className ?? ''}`}>
      {children}
      <span className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-2xl border border-white/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0">
        <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-50">
          <Sparkles className="h-3.5 w-3.5 text-pink-300" />
          {title}
        </span>
        <span className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-200">
          <Activity className="h-3.5 w-3.5" />
          상태: {statusLabel}
        </span>
        {timestamp ? (
          <span className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-300/95">
            <Clock3 className="h-3.5 w-3.5" />
            {new Date(timestamp).toLocaleString()}
          </span>
        ) : null}
        {description ? <span className="block text-[10px] leading-relaxed text-slate-300/90">{description}</span> : null}
      </span>
    </span>
  );
}
