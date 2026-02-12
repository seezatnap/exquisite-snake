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

test("Game wraps Phaser mount in dynamic import with ssr disabled", async () => {
  const gameSource = await readSource("src/components/Game.tsx");

  assert.match(gameSource, /import dynamic from "next\/dynamic";/);
  assert.match(
    gameSource,
    /dynamic\(\(\)\s*=>\s*Promise\.resolve\(PhaserGameMount\),\s*\{\s*ssr:\s*false,\s*\}\)/,
  );
});

test("Game bootstraps Phaser once and destroys/cleans up on unmount", async () => {
  const gameSource = await readSource("src/components/Game.tsx");

  assert.match(gameSource, /import\("phaser"\)/);
  assert.match(
    gameSource,
    /if\s*\(cancelled\s*\|\|\s*!mountNode\.isConnected\s*\|\|\s*gameRef\.current\)/,
  );
  assert.match(gameSource, /mountNode\.replaceChildren\(\);/);
  assert.match(gameSource, /gameRef\.current\.destroy\(true\);/);
  assert.match(gameSource, /mountNode\.replaceChildren\(\);/);
});
