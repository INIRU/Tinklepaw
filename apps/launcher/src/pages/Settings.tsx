import { useEffect, useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { detectJava } from "../lib/minecraft";

interface SettingsProps {
  onNavigate: (page: "home" | "settings") => void;
}

export default function Settings({ onNavigate }: SettingsProps) {
  const { settings, loadSettings, updateSettings } = useSettings();
  const [javaVersion, setJavaVersion] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings.javaPath) {
      detectJava(settings.javaPath).then((info) => {
        if (info) setJavaVersion(info.version);
      });
    }
  }, [settings.javaPath]);

  const handleDetectJava = async () => {
    setDetecting(true);
    try {
      const info = await detectJava();
      if (info) {
        await updateSettings({ javaPath: info.path });
        setJavaVersion(info.version);
      } else {
        alert("Java를 찾을 수 없습니다. 직접 경로를 입력해주세요.");
      }
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden launcher-bg stars-layer">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button
          onClick={() => onNavigate("home")}
          className="glass glass-hover px-3 py-1.5 text-xs text-text-muted cursor-pointer flex-shrink-0"
        >
          ← 돌아가기
        </button>
        <h1 className="text-lg font-bold text-text">설정</h1>
      </div>

      {/* Settings Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-lg mx-auto w-full">
        {/* Java */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">Java 경로</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.javaPath}
              onChange={(e) => updateSettings({ javaPath: e.target.value })}
              placeholder="자동 감지 또는 직접 입력..."
              className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border
                text-sm text-text placeholder:text-text-dim
                focus:outline-none focus:border-pink/40 transition-colors"
            />
            <button
              onClick={handleDetectJava}
              disabled={detecting}
              className="glass glass-hover px-3 py-2 text-xs text-text-muted whitespace-nowrap cursor-pointer flex-shrink-0"
            >
              {detecting ? "감지 중..." : "자동 감지"}
            </button>
          </div>
          {javaVersion && (
            <p className="text-xs text-text-dim">{javaVersion}</p>
          )}
        </section>

        {/* Memory */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">메모리 할당</h2>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1024}
              max={8192}
              step={512}
              value={settings.maxMemoryMb}
              onChange={(e) =>
                updateSettings({ maxMemoryMb: Number(e.target.value) })
              }
              className="flex-1 h-1.5 appearance-none cursor-pointer
                [&::-webkit-slider-runnable-track]:h-1.5
                [&::-webkit-slider-runnable-track]:rounded-full
                [&::-webkit-slider-runnable-track]:bg-surface
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-gradient-brand
                [&::-webkit-slider-thumb]:-mt-[3px]"
            />
            <span className="text-sm font-mono text-lavender min-w-[60px] text-right">
              {(settings.maxMemoryMb / 1024).toFixed(1)} GB
            </span>
          </div>
        </section>

        {/* Game Directory */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">게임 디렉토리</h2>
          <input
            type="text"
            value={settings.gameDir}
            onChange={(e) => updateSettings({ gameDir: e.target.value })}
            placeholder="기본값 (자동)"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border
              text-sm text-text placeholder:text-text-dim
              focus:outline-none focus:border-pink/40 transition-colors"
          />
          <p className="text-xs text-text-dim">
            비워두면 기본 경로를 사용합니다.
          </p>
        </section>

        {/* Server */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text">서버 주소</h2>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={settings.serverHost}
                onChange={(e) => updateSettings({ serverHost: e.target.value })}
                placeholder="meow.minecraft.skyline23.com"
                className="w-full min-w-0 px-3 py-2 rounded-lg bg-surface border border-border
                  text-sm text-text placeholder:text-text-dim
                  focus:outline-none focus:border-pink/40 transition-colors"
              />
            </div>
            <input
              type="number"
              value={settings.serverPort}
              onChange={(e) =>
                updateSettings({ serverPort: Number(e.target.value) })
              }
              placeholder="25565"
              className="w-20 px-3 py-2 rounded-lg bg-surface border border-border
                text-sm text-text placeholder:text-text-dim text-center
                focus:outline-none focus:border-pink/40 transition-colors"
            />
          </div>
        </section>

        {/* Version Info */}
        <section className="pt-4 border-t border-border">
          <div className="text-xs text-text-dim space-y-1">
            <p>방울냥 런처 v0.1.0</p>
            <p>Minecraft 1.21.11</p>
          </div>
        </section>
      </div>
    </div>
  );
}
