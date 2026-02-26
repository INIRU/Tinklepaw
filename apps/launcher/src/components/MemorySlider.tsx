interface MemorySliderProps {
  value: number;
  onChange: (value: number) => void;
}

const MIN_MB = 1024;
const MAX_MB = 8192;
const STEP_MB = 512;

export default function MemorySlider({ value, onChange }: MemorySliderProps) {
  const displayGB = (value / 1024).toFixed(1);
  const percent = ((value - MIN_MB) / (MAX_MB - MIN_MB)) * 100;

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* RAM icon */}
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="flex-shrink-0 opacity-50">
        <rect x="1" y="3" width="11" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4 3V1.5M6.5 3V1.5M9 3V1.5M4 10v1.5M6.5 10v1.5M9 10v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <rect x="3" y="5" width="2" height="3" rx="0.5" fill="currentColor" opacity="0.5"/>
        <rect x="5.75" y="5" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.5"/>
        <rect x="8" y="5" width="2" height="3" rx="0.5" fill="currentColor" opacity="0.5"/>
      </svg>

      {/* Slider track */}
      <div className="relative flex-1 min-w-0">
        {/* Filled portion */}
        <div
          className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 bg-gradient-brand rounded-full pointer-events-none z-10"
          style={{ width: `${percent}%` }}
        />
        <input
          type="range"
          min={MIN_MB}
          max={MAX_MB}
          step={STEP_MB}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="range-slider relative z-20"
        />
      </div>

      {/* Value label */}
      <span className="text-[11px] font-mono text-lavender flex-shrink-0 w-[36px] text-right">
        {displayGB}G
      </span>
    </div>
  );
}
