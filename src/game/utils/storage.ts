export const HIGH_SCORE_STORAGE_KEY = "exquisite-snake.high-score";

let fallbackHighScore = 0;

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function parseHighScore(rawValue: string | null): number {
  if (rawValue === null) {
    return 0;
  }

  return clampNonNegativeInteger(Number.parseInt(rawValue, 10));
}

function getLocalStorageSafely(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadHighScore(): number {
  const storage = getLocalStorageSafely();

  if (!storage) {
    return fallbackHighScore;
  }

  try {
    fallbackHighScore = Math.max(
      fallbackHighScore,
      parseHighScore(storage.getItem(HIGH_SCORE_STORAGE_KEY)),
    );
  } catch {
    // Keep gameplay resilient when storage APIs are unavailable.
  }

  return fallbackHighScore;
}

export function persistHighScore(candidateHighScore: number): number {
  fallbackHighScore = Math.max(
    fallbackHighScore,
    clampNonNegativeInteger(candidateHighScore),
  );

  const storage = getLocalStorageSafely();

  if (!storage) {
    return fallbackHighScore;
  }

  try {
    const nextHighScore = Math.max(
      fallbackHighScore,
      parseHighScore(storage.getItem(HIGH_SCORE_STORAGE_KEY)),
    );
    storage.setItem(HIGH_SCORE_STORAGE_KEY, String(nextHighScore));
    fallbackHighScore = nextHighScore;
  } catch {
    // Keep gameplay resilient when storage APIs are unavailable.
  }

  return fallbackHighScore;
}
