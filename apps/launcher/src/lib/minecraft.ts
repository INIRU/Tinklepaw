import { invoke } from "@tauri-apps/api/core";

export interface JavaInfo {
  path: string;
  version: string;
}

export interface InstallStatus {
  installed: boolean;
  game_dir: string;
}

export async function detectJava(
  customPath?: string,
): Promise<JavaInfo | null> {
  return invoke<JavaInfo | null>("detect_java", {
    customPath: customPath ?? null,
  });
}

export async function checkInstallation(): Promise<InstallStatus> {
  return invoke<InstallStatus>("check_installation");
}

export async function installMinecraft(): Promise<void> {
  return invoke<void>("install_minecraft");
}


export async function launchMinecraft(params: {
  javaPath: string;
  maxMemoryMb: number;
  playerName: string;
  playerUuid: string;
  accessToken: string;
  serverHost: string;
  serverPort: number;
  gameDir?: string;
}): Promise<void> {
  return invoke<void>("launch_minecraft", {
    javaPath: params.javaPath,
    maxMemoryMb: params.maxMemoryMb,
    playerName: params.playerName,
    playerUuid: params.playerUuid,
    accessToken: params.accessToken,
    serverHost: params.serverHost,
    serverPort: params.serverPort,
    gameDir: params.gameDir ?? null,
  });
}
