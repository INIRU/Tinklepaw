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

  if (!isInstalled) {
    return (
      <button
        onClick={onClick}
        disabled={isDisabled}
        className="install-btn w-[240px] h-[52px] flex items-center justify-center gap-2.5
          text-base font-semibold text-text-muted cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-70">
          <path d="M8 1v9M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        설치하기
      </button>
    );
  }


  let label = "플레이";
  let icon = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <polygon points="5,2 16,9 5,16" fill="white" />
    </svg>
  );

  if (isInstalling) { label = "설치 중..."; icon = <Spinner />; }
  else if (isLaunching) { label = "시작 중..."; icon = <Spinner />; }
  else if (isRunning) { label = "실행 중"; icon = <RunningDot />; }

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`play-btn w-[240px] h-[56px] flex items-center justify-center gap-3
        text-lg font-bold text-white tracking-wide
        ${!isDisabled ? "animate-pulse-glow cursor-pointer" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="animate-spin">
      <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <path d="M9 2a7 7 0 0 1 7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RunningDot() {
  return (
    <span className="relative flex w-2.5 h-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
    </span>
  );
}
