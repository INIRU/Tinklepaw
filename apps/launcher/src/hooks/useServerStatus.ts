import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface ServerStatus {
  online: boolean;
  players_online: number;
  players_max: number;
  motd: string;
  latency_ms: number;
}

interface ServerStatusState {
  status: ServerStatus | null;
  isLoading: boolean;
  error: string | null;
  fetchStatus: (host: string, port: number) => Promise<void>;
}

export const useServerStatus = create<ServerStatusState>((set) => ({
  status: null,
  isLoading: false,
  error: null,

  fetchStatus: async (host: string, port: number) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<ServerStatus>("ping_server", { host, port });
      set({ status, isLoading: false });
    } catch (err) {
      set({
        status: {
          online: false,
          players_online: 0,
          players_max: 0,
          motd: "",
          latency_ms: 0,
        },
        isLoading: false,
        error: String(err),
      });
    }
  },
}));
