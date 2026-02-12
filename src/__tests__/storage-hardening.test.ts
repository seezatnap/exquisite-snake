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

describe("Storage hardening – high-score round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save then load round-trips correctly for typical scores", () => {
    const scores = [0, 1, 10, 42, 100, 999, 1000000];
    for (const score of scores) {
      saveHighScore(score);
      expect(loadHighScore()).toBe(score);
    }
  });

  it("multiple saves overwrite correctly", () => {
    saveHighScore(10);
    expect(loadHighScore()).toBe(10);

    saveHighScore(20);
    expect(loadHighScore()).toBe(20);

    saveHighScore(5);
    expect(loadHighScore()).toBe(5);
  });

  it("clearHighScore followed by loadHighScore returns 0", () => {
    saveHighScore(42);
    clearHighScore();
    expect(loadHighScore()).toBe(0);
  });

  it("loadHighScore returns 0 for empty string", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "");
    expect(loadHighScore()).toBe(0);
  });

  it("loadHighScore returns 0 for NaN string", () => {
    localStorage.setItem(KEYS.HIGH_SCORE, "NaN");
    expect(loadHighScore()).toBe(0);
  });

  it("saveHighScore handles 0 correctly", () => {
    saveHighScore(0);
    expect(loadHighScore()).toBe(0);
    expect(localStorage.getItem(KEYS.HIGH_SCORE)).toBe("0");
  });
});

describe("Storage hardening – JSON helpers round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writeJSON then readJSON round-trips objects", () => {
    writeJSON("config", { theme: "dark", volume: 0.5 });
    expect(readJSON("config", null)).toEqual({ theme: "dark", volume: 0.5 });
  });

  it("writeJSON then readJSON round-trips arrays", () => {
    writeJSON("scores", [100, 200, 300]);
    expect(readJSON("scores", [])).toEqual([100, 200, 300]);
  });

  it("writeJSON then readJSON round-trips strings", () => {
    writeJSON("name", "player1");
    expect(readJSON("name", "")).toBe("player1");
  });

  it("writeJSON then readJSON round-trips numbers", () => {
    writeJSON("count", 42);
    expect(readJSON("count", 0)).toBe(42);
  });

  it("writeJSON then readJSON round-trips booleans", () => {
    writeJSON("active", true);
    expect(readJSON("active", false)).toBe(true);
  });

  it("writeJSON then readJSON round-trips null", () => {
    writeJSON("empty", null);
    expect(readJSON("empty", "default")).toBeNull();
  });

  it("removeKey removes JSON data", () => {
    writeJSON("temp", { x: 1 });
    removeKey("temp");
    expect(readJSON("temp", "gone")).toBe("gone");
  });

  it("readJSON returns fallback for keys without the prefix", () => {
    localStorage.setItem("noprefix", JSON.stringify({ data: 1 }));
    expect(readJSON("noprefix", "fallback")).toBe("fallback");
    // Should only read prefixed keys
    localStorage.setItem(`${STORAGE_PREFIX}noprefix`, JSON.stringify({ data: 1 }));
    expect(readJSON("noprefix", "fallback")).toEqual({ data: 1 });
  });
});

describe("Storage hardening – concurrent access patterns", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("high-score operations interleaved with JSON operations work correctly", () => {
    saveHighScore(100);
    writeJSON("settings", { sound: true });

    expect(loadHighScore()).toBe(100);
    expect(readJSON("settings", null)).toEqual({ sound: true });

    clearHighScore();
    expect(loadHighScore()).toBe(0);
    expect(readJSON("settings", null)).toEqual({ sound: true });
  });

  it("different keys do not interfere with each other", () => {
    writeJSON("a", 1);
    writeJSON("b", 2);
    writeJSON("c", 3);

    expect(readJSON("a", 0)).toBe(1);
    expect(readJSON("b", 0)).toBe(2);
    expect(readJSON("c", 0)).toBe(3);

    removeKey("b");
    expect(readJSON("a", 0)).toBe(1);
    expect(readJSON("b", 0)).toBe(0);
    expect(readJSON("c", 0)).toBe(3);
  });
});

describe("Storage hardening – fault tolerance", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("all functions survive repeated storage failures", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    // None should throw
    expect(() => saveHighScore(100)).not.toThrow();
    expect(loadHighScore()).toBe(0);
    expect(() => clearHighScore()).not.toThrow();
    expect(() => writeJSON("key", "val")).not.toThrow();
    expect(readJSON("key", "default")).toBe("default");
    expect(() => removeKey("key")).not.toThrow();
    expect(isStorageAvailable()).toBe(false);

    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });

  it("isStorageAvailable returns true after storage recovers", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("SecurityError");
      });

    expect(isStorageAvailable()).toBe(false);

    spy.mockRestore();
    expect(isStorageAvailable()).toBe(true);
  });
});
