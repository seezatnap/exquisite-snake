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

test("StartScreen is a client component that loads persisted high score", async () => {
  const source = await readSource("src/components/StartScreen.tsx");

  assert.match(source, /^"use client";/);
  assert.match(source, /import \{ loadHighScore \} from "@\/game\/utils\/storage";/);
  assert.match(source, /setHighScore\(loadHighScore\(\)\);/);
  assert.match(source, /High Score/);
});

test("StartScreen listens to MainScene bridge and hides outside the start phase", async () => {
  const source = await readSource("src/components/StartScreen.tsx");

  assert.match(source, /import\("@\/game\/scenes\/MainScene"\)/);
  assert.match(source, /subscribeToMainSceneState/);
  assert.match(source, /setPhase\(nextPhase\);/);
  assert.match(source, /if \(phase !== "start"\) \{\s*return null;/);
});

test("StartScreen renders animated logo/title treatment and press-any-key prompt", async () => {
  const source = await readSource("src/components/StartScreen.tsx");

  assert.match(source, /LOGO_SEGMENT_OFFSETS/);
  assert.match(source, /animate-pulse/);
  assert.match(source, />\s*Exquisite Snake\s*</);
  assert.match(source, />\s*Press any key\s*</);
});
