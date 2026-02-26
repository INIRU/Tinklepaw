import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { checkInstallation, installMinecraft, launchMinecraft } from "../lib/minecraft";

interface DownloadProgress {
  fileName: string;
  current: number;
  total: number;
  percent: number;
  stage: string;
}

interface LaunchState {
  isInstalled: boolean;
  isInstalling: boolean;
  isLaunching: boolean;
  isRunning: boolean;
  downloadProgress: DownloadProgress | null;
  gameLogs: string[];
  error: string | null;
  checkInstall: () => Promise<void>;
  install: () => Promise<void>;
  launch: (params: {
    javaPath: string;
    maxMemoryMb: number;
    playerName: string;
    playerUuid: string;
    accessToken: string;
    serverHost: string;
    serverPort: number;
    gameDir?: string;
  }) => Promise<void>;
  initListeners: () => Promise<() => void>;
}

export const useLaunch = create<LaunchState>((set, get) => ({
  isInstalled: false,
  isInstalling: false,
  isLaunching: false,
  isRunning: false,
  downloadProgress: null,
  gameLogs: [],
  error: null,

  checkInstall: async () => {
    try {
      const status = await checkInstallation();
      set({ isInstalled: status.installed });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  install: async () => {
    set({ isInstalling: true, error: null, downloadProgress: null });
    try {
      await installMinecraft();
      set({ isInstalling: false, isInstalled: true });
    } catch (err) {
      set({ isInstalling: false, error: String(err) });
    }
  },

  launch: async (params) => {
    set({ isLaunching: true, error: null, gameLogs: [] });
    try {
      await launchMinecraft(params);
      set({ isLaunching: false, isRunning: true });
    } catch (err) {
      set({ isLaunching: false, error: String(err) });
    }
  },

  initListeners: async () => {
    const unlistenProgress = await listen<DownloadProgress>(
      "download-progress",
      (event) => {
        set({ downloadProgress: event.payload });
      },
    );

    const unlistenLog = await listen<string>("game-log", (event) => {
      set((state) => ({
        gameLogs: [...state.gameLogs.slice(-200), event.payload],
      }));
    });

    const unlistenStarted = await listen<boolean>("game-started", () => {
      set({ isRunning: true, isLaunching: false });
    });

    const unlistenExited = await listen<number>("game-exited", () => {
      set({ isRunning: false });
    });

    return () => {
      unlistenProgress();
      unlistenLog();
      unlistenStarted();
      unlistenExited();
    };
  },
}));
