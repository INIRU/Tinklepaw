interface ProgressBarProps {
  percent: number;
  label: string;
  sublabel?: string;
}

export default function ProgressBar({ percent, label, sublabel }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full space-y-2.5">
      {/* Labels */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <span className="text-xs font-mono text-lavender tabular-nums">
          {Math.round(clamped)}%
        </span>
      </div>

      {/* Track */}
      <div className="progress-track h-[5px] w-full">
        <div
          className="progress-fill h-full"
          style={{ width: `${clamped}%` }}
        />
      </div>

      {/* Sublabel */}
      {sublabel && (
        <p className="text-[10px] text-text-dim truncate leading-none">{sublabel}</p>
      )}
    </div>
  );
}
