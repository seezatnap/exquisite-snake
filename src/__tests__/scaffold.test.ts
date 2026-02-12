import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("Project scaffold", () => {
  const expectedFiles = [
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/components/Game.tsx",
    "src/components/HUD.tsx",
    "src/components/StartScreen.tsx",
    "src/components/GameOver.tsx",
    "src/game/config.ts",
    "src/game/scenes/Boot.ts",
    "src/game/scenes/MainScene.ts",
    "src/game/entities/Snake.ts",
    "src/game/entities/Food.ts",
    "src/game/utils/grid.ts",
    "src/game/utils/storage.ts",
    "src/styles/globals.css",
  ];

  const expectedDirs = [
    "src/app",
    "src/components",
    "src/game",
    "src/game/scenes",
    "src/game/entities",
    "src/game/systems",
    "src/game/utils",
    "src/styles",
  ];

  it.each(expectedFiles)("has file: %s", (file) => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  });

  it.each(expectedDirs)("has directory: %s", (dir) => {
    const stat = fs.statSync(path.join(ROOT, dir));
    expect(stat.isDirectory()).toBe(true);
  });

  it("game/systems/ directory exists for future phases", () => {
    const systemsDir = path.join(ROOT, "src/game/systems");
    expect(fs.existsSync(systemsDir)).toBe(true);
    expect(fs.statSync(systemsDir).isDirectory()).toBe(true);
  });
});
