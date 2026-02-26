interface LaunchButtonProps {
  isInstalled: boolean;
  isInstalling: boolean;
  isLaunching: boolean;
  isRunning: boolean;
  onClick: () => void;
}

export default function LaunchButton({
  isInstalled,
  isInstalling,
  isLaunching,
  isRunning,
  onClick,
}: LaunchButtonProps) {
  const isDisabled = isInstalling || isLaunching || isRunning;

  let label = "플레이";
  if (!isInstalled) label = "설치";
  if (isInstalling) label = "설치 중...";
  if (isLaunching) label = "시작 중...";
  if (isRunning) label = "실행 중";

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        relative w-full py-3.5 rounded-xl text-lg font-bold text-white
        transition-all duration-300
        ${
          isDisabled
            ? "opacity-50 cursor-not-allowed bg-gradient-brand"
            : "bg-gradient-brand hover:scale-[1.02] active:scale-[0.98] animate-pulse-glow cursor-pointer"
        }
      `}
    >
      {label}
    </button>
  );
}
