import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../hooks/useSettings";
import { useServerStatus } from "../hooks/useServerStatus";
import { useLaunch } from "../hooks/useLaunch";
import { detectJava } from "../lib/minecraft";
import PlayerCard from "../components/PlayerCard";
import ServerStatus from "../components/ServerStatus";
import MemorySlider from "../components/MemorySlider";
import LaunchButton from "../components/LaunchButton";
import ProgressBar from "../components/ProgressBar";

interface HomeProps {
  onNavigate: (page: "home" | "settings") => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { profile, mcAccessToken, logout } = useAuth();
  const { settings, loadSettings, updateSettings } = useSettings();
  const { status, isLoading: statusLoading, fetchStatus } = useServerStatus();
  const {
    isInstalled,
    isInstalling,
    isLaunching,
    isRunning,
    modsUpdateAvailable,
    downloadProgress,
    gameLogs,
    error,
    checkInstall,
    install,
    checkModsUpdate,
    updateMods,
    launch,
    initListeners,
  } = useLaunch();

  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadSettings();
    checkInstall();
    checkModsUpdate();
    const cleanup = initListeners();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    fetchStatus(settings.serverHost, settings.serverPort);
    const interval = setInterval(() => {
      fetchStatus(settings.serverHost, settings.serverPort);
    }, 30000);
    return () => clearInterval(interval);
  }, [settings.serverHost, settings.serverPort]);

  const handlePlayClick = async () => {
    if (!isInstalled) {
      await install();
      return;
    }

    if (modsUpdateAvailable) {
      await updateMods();
      return;
    }

    if (!profile || !mcAccessToken) return;

    let javaPath = settings.javaPath;
    if (!javaPath) {
      const detected = await detectJava();
      if (detected) {
        javaPath = detected.path;
        await updateSettings({ javaPath: detected.path });
      } else {
        // Auto-install Java 21
        try {
          javaPath = await invoke<string>("install_java");
          await updateSettings({ javaPath });
        } catch (e) {
          alert(`Java 설치 실패: ${e}\n설정에서 Java 경로를 직접 입력해주세요.`);
          onNavigate("settings");
          return;
        }
      }
    }

    await launch({
      javaPath,
      maxMemoryMb: settings.maxMemoryMb,
      playerName: profile.name,
      playerUuid: profile.id,
      accessToken: mcAccessToken,
      serverHost: settings.serverHost,
      serverPort: settings.serverPort,
      gameDir: settings.gameDir || undefined,
    });
  };

  const showProgress = isInstalling && downloadProgress;

  return (
    <div className="relative w-full h-full overflow-hidden launcher-bg stars-layer">

      {/* ── Top bar ── */}
      <div className="top-bar absolute top-0 left-0 right-0 h-12 z-20 flex items-center justify-between px-5">
        {/* Launcher wordmark */}
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-text-dim select-none">
          방울냥 런처
        </span>

        {/* Settings gear */}
        <button
          onClick={() => onNavigate("settings")}
          className="icon-btn"
          title="설정"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
              stroke="currentColor" strokeWidth="1.3"
            />
            <path
              d="M12.1 5.7 13 4.3l-1.3-1.3-1.4.9A4.9 4.9 0 0 0 9 3.4L8.7 2h-1.4L7 3.4A4.9 4.9 0 0 0 5.7 4L4.3 3.1 3 4.3l.9 1.4A4.9 4.9 0 0 0 3.4 7H2v1.5h1.4c.12.46.32.9.57 1.3L3 11.2l1.3 1.3 1.4-.9c.4.25.84.45 1.3.57V13.5h1.5v-1.33c.46-.12.9-.32 1.3-.57l1.4.9 1.3-1.3-.9-1.4c.25-.4.45-.84.57-1.3H13.5V7h-1.33a4.9 4.9 0 0 0-.57-1.3Z"
              stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* ── Center stage ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0 z-10"
           style={{ paddingBottom: "56px", paddingTop: "48px" }}>

        {/* Logo block */}
        <div className="flex flex-col items-center animate-fade-in-up" style={{ gap: "6px" }}>
          {/* Decorative sparkle row */}
          <div className="flex items-center gap-3 mb-1">
            <span className="w-12 h-px bg-gradient-to-r from-transparent to-pink/40" />
            <span className="text-[10px] text-pink/60 tracking-[0.3em] uppercase font-medium">방울냥 서버</span>
            <span className="w-12 h-px bg-gradient-to-l from-transparent to-pink/40" />
          </div>

          {/* Main logo */}
          <h1
            className="gradient-text animate-logo-glow select-none"
            style={{
              fontSize: "88px",
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            방울냥
          </h1>

          {/* Version subtitle */}
          <p className="text-[13px] font-medium tracking-[0.12em] text-text-dim uppercase mt-1 delay-100 animate-fade-in-up">
            Minecraft 1.21.11
          </p>

          {/* Online status badge */}
          <div className="mt-3 delay-200 animate-fade-in-up">
            {status?.online ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full
                bg-mint/10 border border-mint/20">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-mint" />
                </span>
                <span className="text-[12px] font-semibold text-mint tracking-wide">
                  {status.players_online}명 접속 중
                </span>
              </div>
            ) : statusLoading ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full
                bg-white/5 border border-white/8">
                <span className="w-2 h-2 rounded-full bg-lemon animate-pulse" />
                <span className="text-[11px] text-text-dim">서버 확인 중...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full
                bg-white/5 border border-white/8">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[11px] text-text-dim">서버 오프라인</span>
              </div>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ height: "36px" }} />

        {/* Action area */}
        <div className="flex flex-col items-center gap-3 delay-300 animate-fade-in-up">
          {/* Error */}
          {error && (
            <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20
              text-xs text-red-300 text-center max-w-[300px]">
              {error}
            </div>
          )}

          {/* Progress bar (replaces button area during install) */}
          {showProgress ? (
            <div className="w-[300px] space-y-2">
              <ProgressBar
                percent={downloadProgress!.percent}
                label={downloadProgress!.stage}
                sublabel={downloadProgress!.fileName}
              />
            </div>
          ) : (
            <LaunchButton
              isInstalled={isInstalled}
              isInstalling={isInstalling}
              isLaunching={isLaunching}
              isRunning={isRunning}
              modsUpdateAvailable={modsUpdateAvailable}
              onClick={handlePlayClick}
            />
          )}
        </div>
      </div>

      {/* ── Game log toggle (above bottom bar) ── */}
      {(isRunning || gameLogs.length > 0) && (
        <div className="absolute bottom-[56px] left-0 right-0 z-20">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full px-5 py-1.5 text-[10px] text-text-dim hover:text-text-muted
              transition-colors text-left cursor-pointer bg-black/20 border-t border-white/5"
          >
            {showLogs ? "▲ 로그 숨기기" : "▼ 로그 보기"} ({gameLogs.length})
          </button>
          {showLogs && (
            <div className="log-panel h-28 overflow-y-auto px-5 py-2
              font-mono text-[10px] text-text-dim space-y-0.5">
              {gameLogs.map((log, i) => (
                <div key={i} className="leading-relaxed break-all">{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom bar ── */}
      <div className="bottom-bar absolute bottom-0 left-0 right-0 h-14 z-20
        flex items-center px-5 gap-4">

        {/* Left: player */}
        {profile ? (
          <PlayerCard
            name={profile.name}
            uuid={profile.id}
            onLogout={logout}
          />
        ) : (
          <div className="w-[130px] h-8 rounded-lg bg-white/5 animate-pulse" />
        )}

        {/* Divider */}
        <div className="bottom-divider" />

        {/* Center: server status */}
        <div className="flex-1 flex items-center justify-center">
          <ServerStatus
            online={status?.online ?? false}
            playersOnline={status?.players_online ?? 0}
            playersMax={status?.players_max ?? 0}
            latencyMs={status?.latency_ms ?? 0}
            isLoading={statusLoading}
          />
        </div>

        {/* Divider */}
        <div className="bottom-divider" />

        {/* Right: memory + settings */}
        <div className="flex items-center gap-3">
          <div style={{ width: "160px" }}>
            <MemorySlider
              value={settings.maxMemoryMb}
              onChange={(v) => updateSettings({ maxMemoryMb: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
