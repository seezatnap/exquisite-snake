/**
 * localStorage helpers with fault-tolerant fallbacks.
 *
 * All public functions silently fall back to defaults when localStorage
 * is unavailable (SSR, private browsing quota exceeded, SecurityError, etc.).
 */

const STORAGE_PREFIX = "exquisite-snake:";

const KEYS = {
  HIGH_SCORE: `${STORAGE_PREFIX}highScore`,
} as const;

/** Check whether localStorage is accessible right now. */
function isStorageAvailable(): boolean {
  try {
    const testKey = `${STORAGE_PREFIX}__test__`;
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// ── High-score helpers ──────────────────────────────────────────

/** Load the persisted high score. Returns 0 when unavailable or corrupt. */
export function loadHighScore(): number {
  try {
    const raw = window.localStorage.getItem(KEYS.HIGH_SCORE);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

/** Persist a new high score. No-op when localStorage is unavailable. */
export function saveHighScore(score: number): void {
  try {
    if (!Number.isFinite(score) || score < 0) return;
    window.localStorage.setItem(KEYS.HIGH_SCORE, String(Math.floor(score)));
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

/** Clear persisted high score. Useful for reset flows. */
export function clearHighScore(): void {
  try {
    window.localStorage.removeItem(KEYS.HIGH_SCORE);
  } catch {
    // Silently ignore.
  }
}

// ── Generic typed helpers (exported for potential future use) ────

/**
 * Read a JSON value from localStorage.
 * Returns `fallback` on any failure (missing key, parse error, no storage).
 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON-serialisable value to localStorage.
 * No-op when storage is unavailable.
 */
export function writeJSON<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Silently ignore.
  }
}

/** Remove a key from localStorage. No-op when storage is unavailable. */
export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // Silently ignore.
  }
}

/** Re-export for testability. */
export { isStorageAvailable, KEYS, STORAGE_PREFIX };
