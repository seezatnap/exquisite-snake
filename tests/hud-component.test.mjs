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

test("HUD renders score and high-score counters", async () => {
  const source = await readSource("src/components/HUD.tsx");

  assert.match(source, /type HUDProps/);
  assert.match(source, /score\?: number/);
  assert.match(source, /highScore\?: number/);
  assert.match(source, />\s*Score\s*</);
  assert.match(source, />\s*High Score\s*</);
});

test("HUD reserves biome, rewind, and parasite placeholder slots", async () => {
  const source = await readSource("src/components/HUD.tsx");

  assert.match(source, /biomeLabel = "pending"/);
  assert.match(source, /rewindStatus = "pending"/);
  assert.match(source, /parasiteStatus = "empty"/);
  assert.match(source, /label="Biome"/);
  assert.match(source, /label="Rewind"/);
  assert.match(source, /label="Parasites"/);
});

test("HUD subscribes to bridge state and stays hidden in start phase", async () => {
  const source = await readSource("src/components/HUD.tsx");

  assert.match(source, /getMainSceneStateSnapshot/);
  assert.match(source, /subscribeToMainSceneState/);
  assert.match(source, /if \(resolvedPhase === "start"\)/);
  assert.match(source, /return null;/);
});
