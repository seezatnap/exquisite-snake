import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function readSource(filePath) {
  return readFile(path.join(projectRoot, filePath), "utf8");
}

test("layout wires global styles, fonts, and game metadata", async () => {
  const layoutSource = await readSource("src/app/layout.tsx");

  assert.match(layoutSource, /import "\.\.\/styles\/globals\.css";/);
  assert.match(layoutSource, /title:\s*"Exquisite Snake"/);
  assert.match(layoutSource, /description:\s*"A polished neon snake game built with Next\.js and Phaser\."/);
  assert.match(layoutSource, /font-sans/);
  assert.match(layoutSource, /bg-background/);
  assert.match(layoutSource, /text-foreground/);
});

test("page mounts Game and overlays in expected z-index order", async () => {
  const pageSource = await readSource("src/app/page.tsx");

  assert.match(pageSource, /<Game \/>/);
  assert.match(pageSource, /<HUD \/>/);
  assert.match(pageSource, /<StartScreen \/>/);
  assert.match(pageSource, /<GameOver \/>/);
  assert.match(pageSource, /Game canvas"[\s\S]*className="[^"]*arena-floor[^"]*absolute[^"]*z-0[^"]*"/);
  assert.match(
    pageSource,
    /Game HUD"[\s\S]*pointer-events-none absolute inset-x-0 top-0 z-20[^"]*px-4[^"]*pt-4/,
  );
  assert.match(pageSource, /Start menu"[\s\S]*absolute inset-0 z-30[^"]*p-4/);
  assert.match(pageSource, /Game over menu"[\s\S]*absolute inset-0 z-40[^"]*p-4/);
});

test("global styles define neon theme tokens and arena grid treatment", async () => {
  const globalsSource = await readSource("src/styles/globals.css");

  assert.match(globalsSource, /--neon-cyan:\s*#2ef0ff/);
  assert.match(globalsSource, /--neon-pink:\s*#ff4fd8/);
  assert.match(globalsSource, /--color-neon-cyan:\s*var\(--neon-cyan\)/);
  assert.match(globalsSource, /--color-neon-pink:\s*var\(--neon-pink\)/);
  assert.match(globalsSource, /\.arena-floor\s*\{/);
  assert.match(globalsSource, /repeating-linear-gradient\(\s*0deg,/);
  assert.match(globalsSource, /repeating-linear-gradient\(\s*90deg,/);
});

test("global styles keep body background, color, and font-family owned by layout utilities", async () => {
  const globalsSource = await readSource("src/styles/globals.css");
  const bodyRuleMatches = [
    ...globalsSource.matchAll(/(^|})\s*([^{}]*\bbody\b[^{}]*)\{([^{}]*)\}/gms),
  ];

  assert.ok(bodyRuleMatches.length > 0, "expected at least one CSS rule targeting body");

  for (const bodyRuleMatch of bodyRuleMatches) {
    const selector = bodyRuleMatch[2].trim();
    const declarations = bodyRuleMatch[3];

    assert.doesNotMatch(
      declarations,
      /(^|[;\n\r])\s*background(?:-[a-z-]+)?\s*:/m,
      `body rule "${selector}" should not set background properties`,
    );
    assert.doesNotMatch(
      declarations,
      /(^|[;\n\r])\s*color\s*:/m,
      `body rule "${selector}" should not set color`,
    );
    assert.doesNotMatch(
      declarations,
      /(^|[;\n\r])\s*font-family\s*:/m,
      `body rule "${selector}" should not set font-family`,
    );
  }
});
