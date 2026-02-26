import { create } from "zustand";
import { getSetting, setSetting, removeSetting } from "../lib/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AuthTokens, MinecraftProfile } from "../lib/auth";

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  isAuthenticating: boolean;
  profile: MinecraftProfile | null;
  mcAccessToken: string | null;
  error: string | null;
  loadStoredAuth: () => Promise<void>;
  login: () => Promise<void>;
  loginWithCode: (code: string, port: number) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  isLoading: true,
  isAuthenticating: false,
  profile: null,
  mcAccessToken: null,
  error: null,

  loadStoredAuth: async () => {
    try {
      const tokens = await getSetting<AuthTokens>("auth_tokens");
      if (tokens) {
        // Try to refresh the token
        try {
          const refreshed = await invoke<AuthTokens>("refresh_token", {
            refreshToken: tokens.ms_refresh_token,
          });
          await setSetting("auth_tokens", refreshed);
          set({
            isLoggedIn: true,
            profile: refreshed.profile,
            mcAccessToken: refreshed.mc_access_token,
            isLoading: false,
          });
        } catch {
          // Refresh failed, need to re-login
          await removeSetting("auth_tokens");
          set({ isLoggedIn: false, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async () => {
    set({ isAuthenticating: true, error: null });
    try {
      await invoke<void>("microsoft_auth_start");
      const unlisten = await listen<string>("auth_code", async (event) => {
        unlisten();
        await get().loginWithCode(event.payload, 0);
      });
    } catch (err) {
      set({
        error: `로그인 시작 실패: ${err}`,
        isAuthenticating: false,
      });
    }
  },

  loginWithCode: async (code: string, port: number) => {
    set({ isAuthenticating: true, error: null });
    try {
      const tokens = await invoke<AuthTokens>("exchange_auth_code", {
        code,
        port,
      });
      await setSetting("auth_tokens", tokens);
      set({
        isLoggedIn: true,
        profile: tokens.profile,
        mcAccessToken: tokens.mc_access_token,
        isAuthenticating: false,
      });
    } catch (err) {
      set({
        error: `인증 실패: ${err}`,
        isAuthenticating: false,
      });
    }
  },

  logout: async () => {
    await removeSetting("auth_tokens");
    await removeSetting("auth_port");
    set({
      isLoggedIn: false,
      profile: null,
      mcAccessToken: null,
    });
  },
}));
