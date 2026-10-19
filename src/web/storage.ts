// Per-browser preferences only. Storage can be unavailable (private mode, blocked site data).
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`vsxguard:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`vsxguard:${key}`, value);
    } catch {
      // ignore
    }
  },
};
