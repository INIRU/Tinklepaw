export function shouldSuppressError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const err = error as { error?: string; detail?: string };
    
    if (err.error === 'SERVICE_UNAVAILABLE') {
      console.warn('[client] Suppressed SERVICE_UNAVAILABLE error:', err.detail);
      return true;
    }
    
    if (err.error === 'DISCORD_API_ERROR') {
      console.warn('[client] Suppressed DISCORD_API_ERROR:', err.detail);
      return true;
    }
  }
  
  return false;
}

export function showErrorIfNotSuppressed(
  toast: { error: (msg: string) => void },
  error: unknown,
  fallbackMessage: string
): void {
  if (shouldSuppressError(error)) {
    return;
  }
  
  const message = error instanceof Error ? error.message : fallbackMessage;
  toast.error(message);
}
