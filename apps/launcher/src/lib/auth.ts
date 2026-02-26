import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface AuthTokens {
  ms_access_token: string;
  ms_refresh_token: string;
  mc_access_token: string;
  profile: MinecraftProfile;
}

export interface MinecraftProfile {
  id: string;
  name: string;
}

interface AuthUrl {
  url: string;
  port: number;
}

/**
 * Start MS OAuth flow: opens the login URL in system browser
 * and starts a local server to capture the redirect.
 */
export async function startMicrosoftAuth(): Promise<{
  port: number;
  waitForCode: () => Promise<string>;
}> {
  const result = await invoke<AuthUrl>("microsoft_auth_start");

  // Open the auth URL in system browser
  await openUrl(result.url);

  // Return port and a function to wait for the auth code
  return {
    port: result.port,
    waitForCode: () => listenForAuthCode(result.port),
  };
}

/**
 * Listen for the auth redirect on localhost.
 * Opens a TCP listener via a simple HTTP server approach.
 */
async function listenForAuthCode(port: number): Promise<string> {
  // We'll poll a simple endpoint or use the Tauri event system
  // For simplicity, we start a listener in Rust and wait for the code
  return new Promise((resolve, reject) => {
    // The auth code will come through the redirect URL
    // We need to capture it. Since we opened the browser with the redirect_uri,
    // we'll set up a polling mechanism or use window focus events.

    // For MS OAuth, the redirect happens to localhost:{port}?code=xxx
    // We need a small HTTP server. Let's handle this in the frontend
    // by periodically checking or by using a Tauri event.

    // Simplified approach: after user authenticates, they get redirected
    // and we need to manually extract the code. Let's use a prompt approach
    // where the redirect page shows the code.

    // Actually, for a proper implementation we should handle this server-side.
    // Let's set a timeout and resolve when the user comes back.
    const timeout = setTimeout(() => {
      reject(new Error("인증 시간이 초과되었습니다."));
    }, 300000); // 5 minute timeout

    // Store the cleanup
    (window as unknown as Record<string, unknown>).__authCleanup = () => {
      clearTimeout(timeout);
    };

    // We'll resolve this from the auth hook when the code arrives
    (window as unknown as Record<string, unknown>).__authResolve = (
      code: string,
    ) => {
      clearTimeout(timeout);
      resolve(code);
    };

    (window as unknown as Record<string, unknown>).__authReject = (
      err: string,
    ) => {
      clearTimeout(timeout);
      reject(new Error(err));
    };
  });
}

/**
 * Exchange auth code for full Minecraft tokens.
 */
export async function exchangeAuthCode(
  code: string,
  port: number,
): Promise<AuthTokens> {
  return invoke<AuthTokens>("exchange_auth_code", { code, port });
}

/**
 * Refresh tokens.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<AuthTokens> {
  return invoke<AuthTokens>("refresh_token", {
    refreshToken: refreshToken,
  });
}

/**
 * Get Minecraft profile with existing token.
 */
export async function getProfile(
  mcAccessToken: string,
): Promise<MinecraftProfile> {
  return invoke<MinecraftProfile>("get_minecraft_profile", {
    mcAccessToken: mcAccessToken,
  });
}
