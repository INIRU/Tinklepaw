import { create } from "zustand";
import { getSetting, setSetting } from "../lib/store";

export interface LauncherSettings {
  javaPath: string;
  maxMemoryMb: number;
  gameDir: string;
  serverHost: string;
  serverPort: number;
}

const DEFAULT_SETTINGS: LauncherSettings = {
  javaPath: "",
  maxMemoryMb: 4096,
  gameDir: "",
  serverHost: "meow.minecraft.skyline23.com",
  serverPort: 25565,
};

interface SettingsState {
  settings: LauncherSettings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<LauncherSettings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    const stored = await getSetting<LauncherSettings>("launcher_settings");
    if (stored) {
      set({ settings: { ...DEFAULT_SETTINGS, ...stored }, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });
    await setSetting("launcher_settings", updated);
  },
}));
