import { Store } from "@tauri-apps/plugin-store";

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load("nyaru-settings.json");
  }
  return storeInstance;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const store = await getStore();
  const value = await store.get<T>(key);
  return value ?? null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
}

export async function removeSetting(key: string): Promise<void> {
  const store = await getStore();
  await store.delete(key);
  await store.save();
}
