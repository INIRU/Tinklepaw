import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

type Page = "home" | "settings";

export default function App() {
  const { isLoggedIn, isLoading, loadStoredAuth } = useAuth();
  const [page, setPage] = useState<Page>("home");
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; install: () => void } | null>(null);

  useEffect(() => {
    loadStoredAuth();
    // Check for updates (only in production build)
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateAvailable({
          version: update.version,
          install: async () => {
            await update.downloadAndInstall();
          },
        });
      }
    } catch {
      // Silently ignore update check failures (dev mode / no key configured)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="text-3xl font-bold bg-gradient-brand bg-clip-text text-transparent">
            방울냥
          </div>
          <div className="text-text-muted text-sm">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login />;
  }

  return (
    <div className="w-full h-full relative">
      {page === "home" && <Home onNavigate={setPage} />}
      {page === "settings" && <Settings onNavigate={setPage} />}

      {/* Update banner */}
      {updateAvailable && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between
          px-4 py-1.5 bg-lavender/15 border-b border-lavender/25 backdrop-blur-sm">
          <span className="text-[11px] text-lavender font-medium">
            새 버전 {updateAvailable.version} 이용 가능
          </span>
          <button
            onClick={updateAvailable.install}
            className="text-[11px] font-semibold text-white bg-lavender/30
              hover:bg-lavender/50 px-3 py-0.5 rounded-full transition-colors cursor-pointer"
          >
            지금 업데이트
          </button>
        </div>
      )}
    </div>
  );
}
