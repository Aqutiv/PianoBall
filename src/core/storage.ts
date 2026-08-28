const PREFIX = 'pianoball.';

/** localStorage with a namespace and a hard guarantee of never throwing. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' && typeof fallback === 'object' && fallback !== null
      ? { ...(fallback as object), ...(parsed as object) } as T
      : parsed;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function remove(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
