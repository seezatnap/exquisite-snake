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

test("MainScene bridge tracks phase, score, high score, and elapsed survival time", async () => {
  const source = await readSource("src/game/scenes/MainScene.ts");

  assert.match(source, /export type GamePhase = "start" \| "playing" \| "game-over";/);
  assert.match(source, /phase:\s*GamePhase/);
  assert.match(source, /score:\s*number/);
  assert.match(source, /highScore:\s*number/);
  assert.match(source, /elapsedSurvivalMs:\s*number/);
  assert.match(source, /class MainSceneStateBridge/);
  assert.match(source, /subscribe = \(listener: OverlayStateListener\)/);
  assert.match(source, /getSnapshot = \(\): OverlayGameState => this\.state/);
  assert.match(source, /setPhase\(phase: GamePhase\)/);
  assert.match(source, /setScore\(score: number\)/);
  assert.match(source, /setHighScore\(highScore: number\)/);
  assert.match(source, /setElapsedSurvivalMs\(elapsedSurvivalMs: number\)/);
  assert.match(source, /export const mainSceneStateBridge = new MainSceneStateBridge\(\);/);
});

test("MainScene skeleton pushes lifecycle updates into the bridge", async () => {
  const source = await readSource("src/game/scenes/MainScene.ts");

  assert.match(source, /export class MainScene extends Phaser\.Scene/);
  assert.match(source, /create\(\): void/);
  assert.match(source, /update\(time: number\): void/);
  assert.match(source, /mainSceneStateBridge\.resetForNextRun\(\);/);
  assert.match(source, /mainSceneStateBridge\.setPhase\("playing"\);/);
  assert.match(source, /mainSceneStateBridge\.setPhase\("game-over"\);/);
  assert.match(source, /mainSceneStateBridge\.setScore\(nextScore\);/);
  assert.match(source, /mainSceneStateBridge\.setHighScore\(nextScore\);/);
  assert.match(source, /mainSceneStateBridge\.setElapsedSurvivalMs\(time - this\.runStartMs\);/);
  assert.match(source, /setPersistedHighScore\(highScore: number\)/);
  assert.match(source, /resetForReplay\(\): void/);
});
