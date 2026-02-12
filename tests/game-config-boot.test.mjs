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

test("game config defines arena dimensions and derived grid values", async () => {
  const source = await readSource("src/game/config.ts");

  const widthMatch = source.match(/export const ARENA_WIDTH = (\d+);/);
  const heightMatch = source.match(/export const ARENA_HEIGHT = (\d+);/);
  const tileMatch = source.match(/export const TILE_SIZE = (\d+);/);

  assert.ok(widthMatch, "ARENA_WIDTH is missing");
  assert.ok(heightMatch, "ARENA_HEIGHT is missing");
  assert.ok(tileMatch, "TILE_SIZE is missing");

  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  const tile = Number(tileMatch[1]);

  assert.ok(width > 0, "ARENA_WIDTH must be positive");
  assert.ok(height > 0, "ARENA_HEIGHT must be positive");
  assert.ok(tile > 0, "TILE_SIZE must be positive");
  assert.equal(width % tile, 0, "ARENA_WIDTH must divide evenly by TILE_SIZE");
  assert.equal(height % tile, 0, "ARENA_HEIGHT must divide evenly by TILE_SIZE");

  assert.match(source, /export const GRID_COLS = ARENA_WIDTH \/ TILE_SIZE;/);
  assert.match(source, /export const GRID_ROWS = ARENA_HEIGHT \/ TILE_SIZE;/);
});

test("game config wires Phaser scale defaults and registers the MainScene class", async () => {
  const [source, mainSceneSource] = await Promise.all([
    readSource("src/game/config.ts"),
    readSource("src/game/scenes/MainScene.ts"),
  ]);

  assert.match(
    source,
    /export const GAME_CONFIG:\s*Phaser\.Types\.Core\.GameConfig\s*=/,
  );
  assert.match(source, /mode:\s*Phaser\.Scale\.FIT/);
  assert.match(source, /autoCenter:\s*Phaser\.Scale\.CENTER_BOTH/);
  assert.match(source, /autoRound:\s*true/);
  assert.match(source, /import \{ MainScene \} from "\.\/scenes\/MainScene";/);
  assert.match(source, /scene:\s*\[BootScene,\s*MainScene\]/);
  assert.doesNotMatch(
    source,
    /scene:\s*\[[^\]]*\{\s*key:\s*SCENE_KEYS\.MAIN\s*\}[^\]]*\]/s,
  );
  assert.doesNotMatch(source, /MAIN_SCENE_PLACEHOLDER/);
  assert.match(mainSceneSource, /export class MainScene extends Phaser\.Scene/);
  assert.match(
    source,
    /export const SCENE_KEYS = \{\s*BOOT:\s*"Boot",\s*MAIN:\s*"MainScene",/s,
  );
});

test("boot scene creates texture primitives used by gameplay and neon UI", async () => {
  const source = await readSource("src/game/scenes/Boot.ts");

  assert.match(source, /export class BootScene extends Phaser\.Scene/);
  assert.match(source, /this\.scene\.start\(SCENE_KEYS\.MAIN\);/);

  for (const key of [
    "SNAKE_HEAD",
    "SNAKE_BODY",
    "FOOD",
    "FOOD_GLOW",
    "PARTICLE",
    "UI_FRAME",
  ]) {
    assert.match(
      source,
      new RegExp(`TEXTURE_KEYS\\.${key}`),
      `expected texture key ${key} to be generated`,
    );
  }

  assert.match(source, /graphics\.generateTexture\(key,\s*width,\s*height\);/);
  assert.match(source, /if\s*\(this\.textures\.exists\(key\)\)\s*\{\s*return;/s);
});
