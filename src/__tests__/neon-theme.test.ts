import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const css = fs.readFileSync(
  path.join(ROOT, "src/styles/globals.css"),
  "utf-8"
);

describe("globals.css neon theme tokens", () => {
  it("defines grid-line CSS variable for arena grid", () => {
    expect(css).toContain("--grid-line:");
  });

  it("defines grid-line-accent CSS variable", () => {
    expect(css).toContain("--grid-line-accent:");
  });

  it("defines neon-glow-pink shadow variable", () => {
    expect(css).toContain("--neon-glow-pink:");
  });

  it("defines neon-glow-cyan shadow variable", () => {
    expect(css).toContain("--neon-glow-cyan:");
  });

  it("registers grid-line colors as Tailwind theme tokens", () => {
    expect(css).toContain("--color-grid-line:");
    expect(css).toContain("--color-grid-line-accent:");
  });
});

describe("globals.css neon glow utility classes", () => {
  it("defines .neon-glow-pink with text-shadow", () => {
    expect(css).toContain(".neon-glow-pink");
    expect(css).toMatch(/\.neon-glow-pink\s*\{[^}]*text-shadow/);
  });

  it("defines .neon-glow-cyan with text-shadow", () => {
    expect(css).toContain(".neon-glow-cyan");
    expect(css).toMatch(/\.neon-glow-cyan\s*\{[^}]*text-shadow/);
  });

  it("defines .neon-border-pink with box-shadow", () => {
    expect(css).toContain(".neon-border-pink");
    expect(css).toMatch(/\.neon-border-pink\s*\{[^}]*box-shadow/);
  });

  it("defines .neon-border-cyan with box-shadow", () => {
    expect(css).toContain(".neon-border-cyan");
    expect(css).toMatch(/\.neon-border-cyan\s*\{[^}]*box-shadow/);
  });
});

describe("globals.css arena grid lines", () => {
  it("defines .arena-grid class with relative positioning", () => {
    expect(css).toContain(".arena-grid");
    expect(css).toMatch(/\.arena-grid\s*\{[^}]*position:\s*relative/);
  });

  it("defines .arena-grid::before pseudo-element for grid overlay", () => {
    expect(css).toContain(".arena-grid::before");
  });

  it("arena-grid::before uses linear-gradient for grid lines", () => {
    expect(css).toMatch(
      /\.arena-grid::before\s*\{[^}]*linear-gradient/
    );
  });

  it("arena-grid::before has pointer-events: none so it doesn't block clicks", () => {
    expect(css).toMatch(
      /\.arena-grid::before\s*\{[^}]*pointer-events:\s*none/
    );
  });

  it("arena-grid::before uses 20px grid cell size matching TILE_SIZE", () => {
    expect(css).toMatch(
      /\.arena-grid::before\s*\{[^}]*background-size:\s*20px\s+20px/
    );
  });
});

describe("globals.css responsive game wrapper", () => {
  it("defines .game-wrapper with flex layout", () => {
    expect(css).toContain(".game-wrapper");
    expect(css).toMatch(/\.game-wrapper\s*\{[^}]*display:\s*flex/);
  });

  it("game-wrapper centers content", () => {
    expect(css).toMatch(
      /\.game-wrapper\s*\{[^}]*align-items:\s*center/
    );
    expect(css).toMatch(
      /\.game-wrapper\s*\{[^}]*justify-content:\s*center/
    );
  });

  it("game-wrapper constrains to viewport", () => {
    expect(css).toMatch(/\.game-wrapper\s*\{[^}]*max-width:\s*100vw/);
    expect(css).toMatch(/\.game-wrapper\s*\{[^}]*max-height:\s*100dvh/);
  });

  it("includes responsive media query breakpoints", () => {
    expect(css).toContain("@media (min-width: 640px)");
    expect(css).toContain("@media (min-width: 1024px)");
  });
});

describe("globals.css surface panel", () => {
  it("defines .surface-panel with background from --surface", () => {
    expect(css).toContain(".surface-panel");
    expect(css).toMatch(
      /\.surface-panel\s*\{[^}]*background:\s*var\(--surface\)/
    );
  });
});

describe("globals.css accessibility and polish", () => {
  it("defines :focus-visible outline using neon-cyan", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline.*neon-cyan/);
  });

  it("defines ::selection with neon-cyan tint", () => {
    expect(css).toContain("::selection");
  });

  it("defines scrollbar styling", () => {
    expect(css).toContain("::-webkit-scrollbar");
    expect(css).toContain("::-webkit-scrollbar-track");
    expect(css).toContain("::-webkit-scrollbar-thumb");
  });
});
