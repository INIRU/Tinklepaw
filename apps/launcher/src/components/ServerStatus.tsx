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
  return (
    <div className="glass p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
          서버 상태
        </span>
        {isLoading ? (
          <div className="w-2 h-2 rounded-full bg-lemon animate-pulse" />
        ) : (
          <div
            className={`w-2 h-2 rounded-full ${online ? "bg-mint" : "bg-red-500"}`}
          />
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-text-dim">연결 중...</div>
      ) : online ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-text">
              {playersOnline}
            </span>
            <span className="text-sm text-text-muted">/ {playersMax}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-dim">
            <span>meow.minecraft.skyline23.com</span>
            <span>|</span>
            <span>{latencyMs}ms</span>
          </div>
        </>
      ) : (
        <div className="text-sm text-red-400">서버 오프라인</div>
      )}
    </div>
  );
}
