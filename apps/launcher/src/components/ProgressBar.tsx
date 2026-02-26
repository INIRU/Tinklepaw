interface ProgressBarProps {
  percent: number;
  label: string;
  sublabel?: string;
}

export default function ProgressBar({
  percent,
  label,
  sublabel,
}: ProgressBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="text-text-dim">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-brand rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {sublabel && (
        <div className="text-xs text-text-dim truncate">{sublabel}</div>
      )}
    </div>
  );
}
