interface PlayerCardProps {
  name: string;
  uuid: string;
  onLogout: () => void;
}

export default function PlayerCard({ name, uuid, onLogout }: PlayerCardProps) {
  // Crafatar avatar URL (renders the player's face)
  const avatarUrl = `https://crafatar.com/avatars/${uuid}?size=64&overlay`;

  return (
    <div className="glass p-3">
      <div className="flex items-center gap-3">
        <img
          src={avatarUrl}
          alt={name}
          className="w-10 h-10 rounded-lg"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text truncate">
            {name}
          </div>
          <button
            onClick={onLogout}
            className="text-xs text-text-dim hover:text-pink transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
