import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadHighScore,
  saveHighScore,
  clearHighScore,
  readJSON,
  writeJSON,
  removeKey,
  isStorageAvailable,
  KEYS,
  STORAGE_PREFIX,
} from "@/game/utils/storage";

describe("storage – high-score helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── loadHighScore ───────────────────────────────────────────

  it("returns 0 when no high score is stored", () => {
    expect(loadHighScore()).toBe(0);
  });

  it("returns the stored high score", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "42");
    expect(loadHighScore()).toBe(42);
  });

  it("returns 0 for non-numeric stored values", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "not-a-number");
    expect(loadHighScore()).toBe(0);
  });

  it("returns 0 for negative stored values", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "-5");
    expect(loadHighScore()).toBe(0);
  });

  it("returns 0 for Infinity stored values", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "Infinity");
    expect(loadHighScore()).toBe(0);
  });

  it("floors fractional stored values", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "10.7");
    expect(loadHighScore()).toBe(10);
  });

  it("returns 0 when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadHighScore()).toBe(0);
    vi.restoreAllMocks();
  });

  // ── saveHighScore ───────────────────────────────────────────

  it("persists a valid high score", () => {
    saveHighScore(100);
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBe("100");
  });

  it("floors fractional scores before saving", () => {
    saveHighScore(55.9);
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBe("55");
  });

  it("does not save negative scores", () => {
    saveHighScore(-1);
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBeNull();
  });

  it("does not save NaN", () => {
    saveHighScore(NaN);
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBeNull();
  });

  it("does not save Infinity", () => {
    saveHighScore(Infinity);
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBeNull();
  });

  it("silently ignores when localStorage throws on setItem", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveHighScore(100)).not.toThrow();
    vi.restoreAllMocks();
  });

  // ── clearHighScore ──────────────────────────────────────────

  it("removes the high score key", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "50");
    clearHighScore();
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBeNull();
  });

  it("does not throw when key does not exist", () => {
    expect(() => clearHighScore()).not.toThrow();
  });

  it("silently ignores when localStorage throws on removeItem", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearHighScore()).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("storage – isStorageAvailable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns true when localStorage works", () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it("returns false when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(isStorageAvailable()).toBe(false);
    vi.restoreAllMocks();
  });

  it("cleans up test key after probing", () => {
    isStorageAvailable();
    expect(localStorage.getItem(`${STORAGE_PREFIX}__test__`)).toBeNull();
  });
});

describe("storage – generic JSON helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── readJSON ────────────────────────────────────────────────

  it("returns fallback when key does not exist", () => {
    expect(readJSON("missing", { x: 1 })).toEqual({ x: 1 });
  });

  it("returns parsed JSON value", () => {
    localStorage.setItem(`${STORAGE_PREFIX}obj`, JSON.stringify({ a: 1 }));
    expect(readJSON("obj", {})).toEqual({ a: 1 });
  });

  it("returns fallback on malformed JSON", () => {
    localStorage.setItem(`${STORAGE_PREFIX}bad`, "{broken");
    expect(readJSON("bad", "default")).toBe("default");
  });

  it("returns fallback when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readJSON("key", 42)).toBe(42);
    vi.restoreAllMocks();
  });

  // ── writeJSON ───────────────────────────────────────────────

  it("writes a JSON value to localStorage", () => {
    writeJSON("data", [1, 2, 3]);
    const raw = localStorage.getItem(`${STORAGE_PREFIX}data`);
    expect(JSON.parse(raw!)).toEqual([1, 2, 3]);
  });

  it("silently ignores when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeJSON("key", "value")).not.toThrow();
    vi.restoreAllMocks();
  });

  // ── removeKey ───────────────────────────────────────────────

  it("removes a prefixed key", () => {
    localStorage.setItem(`${STORAGE_PREFIX}toRemove`, "value");
    removeKey("toRemove");
    expect(localStorage.getItem(`${STORAGE_PREFIX}toRemove`)).toBeNull();
  });

  it("does not throw when key is missing", () => {
    expect(() => removeKey("nonexistent")).not.toThrow();
  });

  it("silently ignores when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => removeKey("key")).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("storage – key namespacing", () => {
  it("uses the correct prefix for high score key", () => {
    expect(KEYS.HIGH_SCORE).toBe("exquisite-snake:highScore");
  });

  it("STORAGE_PREFIX is 'exquisite-snake:'", () => {
    expect(STORAGE_PREFIX).toBe("exquisite-snake:");
  });
});
