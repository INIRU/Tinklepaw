interface ServerStatusProps {
  online: boolean;
  playersOnline: number;
  playersMax: number;
  latencyMs: number;
  isLoading: boolean;
}

export default function ServerStatus({
  online,
  playersOnline,
  playersMax,
  latencyMs,
  isLoading,
}: ServerStatusProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-lemon animate-pulse flex-shrink-0" />
        <span className="text-[11px] text-text-dim">연결 중...</span>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <span className="text-[11px] text-text-dim">서버 오프라인</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {/* Pulsing dot */}
      <span className="relative flex-shrink-0 w-2 h-2 self-center">
        <span className="animate-ping absolute inset-0 rounded-full bg-mint opacity-60" />
        <span className="absolute inset-0 rounded-full bg-mint" />
      </span>

      {/* Host */}
      <span className="text-[11px] text-text-muted font-medium">
        meow.minecraft.skyline23.com
      </span>

      {/* Separator */}
      <span className="text-text-dim text-[11px]">·</span>

      {/* Latency */}
      <span className="text-[11px] text-text-dim">{latencyMs}ms</span>
    </div>
  );
}
