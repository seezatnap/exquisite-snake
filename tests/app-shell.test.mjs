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
});

test("page mounts Game and overlays in expected z-index order", async () => {
  const pageSource = await readSource("src/app/page.tsx");

  assert.match(pageSource, /<Game \/>/);
  assert.match(pageSource, /<HUD \/>/);
  assert.match(pageSource, /<StartScreen \/>/);
  assert.match(pageSource, /<GameOver \/>/);
  assert.match(pageSource, /Game canvas" className="absolute inset-0 z-0"/);
  assert.match(
    pageSource,
    /Game HUD"[\s\S]*pointer-events-none absolute inset-x-0 top-0 z-20/,
  );
  assert.match(pageSource, /Start menu"[\s\S]*absolute inset-0 z-30/);
  assert.match(pageSource, /Game over menu"[\s\S]*absolute inset-0 z-40/);
});
