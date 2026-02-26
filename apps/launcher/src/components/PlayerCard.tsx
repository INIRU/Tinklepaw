interface PlayerCardProps {
  name: string;
  uuid: string;
  onLogout: () => void;
}

export default function PlayerCard({ name, uuid, onLogout }: PlayerCardProps) {
  const avatarUrl = `https://mc-heads.net/avatar/${uuid}/64`;

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <img
          src={avatarUrl}
          alt={name}
          width={32}
          height={32}
          className="w-8 h-8 rounded-lg ring-1 ring-white/10"
          style={{ imageRendering: "pixelated" }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://minotar.net/avatar/${name}/64`;
          }}
        />
        {/* Online indicator */}
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mint
          ring-2 ring-[#0a0a14] flex items-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-mint animate-ping absolute opacity-70" />
        </span>
      </div>

      {/* Name + logout */}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-text leading-tight truncate max-w-[90px]">
          {name}
        </p>
        <button
          onClick={onLogout}
          className="text-[10px] text-text-dim hover:text-pink transition-colors leading-tight cursor-pointer"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
