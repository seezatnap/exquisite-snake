import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("Project configuration", () => {
  it("next.config.ts has static export output", () => {
    const config = fs.readFileSync(
      path.join(ROOT, "next.config.ts"),
      "utf-8"
    );
    expect(config).toContain('output: "export"');
  });

  it("tsconfig.json has strict mode enabled", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf-8")
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("tsconfig.json has path alias @/* configured", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf-8")
    );
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
  });

  it("package.json uses npm (no yarn.lock or pnpm-lock.yaml)", () => {
    expect(fs.existsSync(path.join(ROOT, "package-lock.json"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "yarn.lock"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "pnpm-lock.yaml"))).toBe(false);
  });

  it("globals.css imports tailwindcss", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "src/styles/globals.css"),
      "utf-8"
    );
    expect(css).toContain("@import \"tailwindcss\"");
  });

  it("game config exports arena dimensions and tile size", () => {
    const config = fs.readFileSync(
      path.join(ROOT, "src/game/config.ts"),
      "utf-8"
    );
    expect(config).toContain("ARENA_WIDTH");
    expect(config).toContain("ARENA_HEIGHT");
    expect(config).toContain("TILE_SIZE");
    expect(config).toContain("GRID_COLS");
    expect(config).toContain("GRID_ROWS");
  });
});
