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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">메모리 할당</span>
        <span className="text-xs font-mono text-lavender">{displayGB} GB</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={MIN_MB}
          max={MAX_MB}
          step={STEP_MB}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 appearance-none bg-transparent cursor-pointer
            [&::-webkit-slider-runnable-track]:h-1.5
            [&::-webkit-slider-runnable-track]:rounded-full
            [&::-webkit-slider-runnable-track]:bg-surface
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gradient-brand
            [&::-webkit-slider-thumb]:-mt-[3px]
            [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,95,162,0.4)]"
        />
        <div
          className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 bg-gradient-brand rounded-full pointer-events-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-dim">
        <span>1 GB</span>
        <span>8 GB</span>
      </div>
    </div>
  );
}
