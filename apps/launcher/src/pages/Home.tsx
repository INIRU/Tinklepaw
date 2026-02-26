import { useEffect, useState } from "react";
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
    downloadProgress,
    gameLogs,
    error,
    checkInstall,
    install,
    launch,
    initListeners,
  } = useLaunch();

  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadSettings();
    checkInstall();
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

    if (!profile || !mcAccessToken) return;

    // Auto-detect Java if not set
    let javaPath = settings.javaPath;
    if (!javaPath) {
      const detected = await detectJava();
      if (detected) {
        javaPath = detected.path;
        await updateSettings({ javaPath: detected.path });
      } else {
        alert("Java를 찾을 수 없습니다. 설정에서 Java 경로를 지정해주세요.");
        onNavigate("settings");
        return;
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

  return (
    <div className="w-full h-full flex bg-bg">
      {/* Left Sidebar */}
      <div className="w-[220px] h-full flex flex-col p-3 gap-3 border-r border-border">
        {/* Player Card */}
        {profile && (
          <PlayerCard
            name={profile.name}
            uuid={profile.id}
            onLogout={logout}
          />
        )}

        {/* Server Status */}
        <ServerStatus
          online={status?.online ?? false}
          playersOnline={status?.players_online ?? 0}
          playersMax={status?.players_max ?? 0}
          latencyMs={status?.latency_ms ?? 0}
          isLoading={statusLoading}
        />

        {/* Memory Slider */}
        <div className="glass p-3">
          <MemorySlider
            value={settings.maxMemoryMb}
            onChange={(v) => updateSettings({ maxMemoryMb: v })}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings Button */}
        <button
          onClick={() => onNavigate("settings")}
          className="glass glass-hover p-2.5 text-xs text-text-muted text-center transition-colors cursor-pointer"
        >
          설정
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-subtle" />

        {/* Content */}
        <div className="relative flex-1 flex flex-col items-center justify-center p-6 gap-6">
          {/* Branding */}
          <div className="text-center space-y-1">
            <h1 className="text-5xl font-bold bg-gradient-brand bg-clip-text text-transparent">
              방울냥
            </h1>
            <p className="text-sm text-text-muted">Minecraft 1.21.4</p>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-3">
            {status?.online && (
              <div className="glass px-3 py-1.5 text-xs text-mint flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-mint" />
                {status.players_online}명 접속 중
              </div>
            )}
            <div className="glass px-3 py-1.5 text-xs text-text-dim">
              {isInstalled ? "설치됨" : "미설치"}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="glass px-4 py-2 text-xs text-red-400 max-w-sm text-center">
              {error}
            </div>
          )}

          {/* Download Progress */}
          {isInstalling && downloadProgress && (
            <div className="w-full max-w-sm">
              <ProgressBar
                percent={downloadProgress.percent}
                label={downloadProgress.stage}
                sublabel={downloadProgress.fileName}
              />
            </div>
          )}

          {/* Launch Button */}
          <div className="w-64">
            <LaunchButton
              isInstalled={isInstalled}
              isInstalling={isInstalling}
              isLaunching={isLaunching}
              isRunning={isRunning}
              onClick={handlePlayClick}
            />
          </div>
        </div>

        {/* Game Log Panel */}
        {(isRunning || gameLogs.length > 0) && (
          <div className="relative border-t border-border">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="w-full px-4 py-1.5 text-xs text-text-dim hover:text-text-muted
                transition-colors text-left cursor-pointer"
            >
              {showLogs ? "로그 숨기기" : "로그 보기"} ({gameLogs.length})
            </button>
            {showLogs && (
              <div className="h-32 overflow-y-auto px-4 pb-2 font-mono text-[10px] text-text-dim space-y-0.5">
                {gameLogs.map((log, i) => (
                  <div key={i} className="leading-relaxed break-all">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
