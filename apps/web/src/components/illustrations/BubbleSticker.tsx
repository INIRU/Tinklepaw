import React from 'react';

export default function BubbleSticker(props: {
  className?: string;
  label: string;
}) {
  return (
    <div className={props.className}>
      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-1.5 text-xs font-semibold text-[color:var(--fg)] shadow-sm">
        <span className="h-2 w-2 rounded-full bg-[color:var(--accent-pink)]" />
        <span>{props.label}</span>
      </div>
    </div>
  );
}
