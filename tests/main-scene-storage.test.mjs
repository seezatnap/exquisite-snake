import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const MOCK_CONFIG = Object.freeze({
  GRID_COLS: 40,
  GRID_ROWS: 30,
  TILE_SIZE: 24,
});

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName,
  }).outputText;
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

async function loadMainSceneModule(storageModule) {
  const [gridSource, snakeSource, sceneSource] = await Promise.all([
    readFile(path.join(projectRoot, "src/game/utils/grid.ts"), "utf8"),
    readFile(path.join(projectRoot, "src/game/entities/Snake.ts"), "utf8"),
    readFile(path.join(projectRoot, "src/game/scenes/MainScene.ts"), "utf8"),
  ]);

  const gridModule = { exports: {} };
  const gridContext = vm.createContext({
    module: gridModule,
    exports: gridModule.exports,
    require(specifier) {
      if (specifier === "../config") {
        return MOCK_CONFIG;
      }

      throw new Error(`Unexpected grid module request: ${specifier}`);
    },
  });

  vm.runInContext(transpile(gridSource, "grid.ts"), gridContext, {
    filename: "grid.cjs",
  });

  const snakeModule = { exports: {} };
  const snakeContext = vm.createContext({
    module: snakeModule,
    exports: snakeModule.exports,
    require(specifier) {
      if (specifier === "../utils/grid") {
        return gridModule.exports;
      }

      throw new Error(`Unexpected snake module request: ${specifier}`);
    },
  });

  vm.runInContext(transpile(snakeSource, "Snake.ts"), snakeContext, {
    filename: "Snake.cjs",
  });

  class MockEmitter {
    constructor() {
      this.listeners = new Map();
    }

    on(eventName, listener, context) {
      const listeners = this.listeners.get(eventName) ?? [];
      listeners.push({ listener, context });
      this.listeners.set(eventName, listeners);
    }

    off(eventName, listener, context) {
      const listeners = this.listeners.get(eventName);
      if (!listeners) {
        return;
      }

      this.listeners.set(
        eventName,
        listeners.filter(
          (candidate) =>
            candidate.listener !== listener || candidate.context !== context,
        ),
      );
    }

    emit(eventName, ...args) {
      const listeners = this.listeners.get(eventName) ?? [];

      for (const { listener, context } of listeners) {
        listener.call(context, ...args);
      }
    }
  }

  class MockKeyboard extends MockEmitter {}

  class MockInput extends MockEmitter {
    constructor() {
      super();
      this.keyboard = new MockKeyboard();
    }
  }

  class MockEvents {
    once() {}
  }

  class MockScene {
    constructor() {
      this.time = { now: 0 };
      this.events = new MockEvents();
      this.input = new MockInput();
    }
  }

  const phaserModule = {
    Scene: MockScene,
    Scenes: {
      Events: {
        SHUTDOWN: "shutdown",
        DESTROY: "destroy",
      },
    },
  };

  const compiledModule = { exports: {} };
  const context = vm.createContext({
    module: compiledModule,
    exports: compiledModule.exports,
    require(specifier) {
      if (specifier === "phaser") {
        return phaserModule;
      }

      if (specifier === "../utils/storage") {
        return storageModule;
      }

      if (specifier === "../entities/Snake") {
        return snakeModule.exports;
      }

      if (specifier === "../utils/grid") {
        return gridModule.exports;
      }

      if (specifier === "../config") {
        return MOCK_CONFIG;
      }

      throw new Error(`Unexpected module request: ${specifier}`);
    },
  });

  vm.runInContext(transpile(sceneSource, "MainScene.ts"), context, {
    filename: "MainScene.cjs",
  });

  return compiledModule.exports;
}

test("MainScene loads persisted high score during create()", async () => {
  const loadCalls = [];
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      loadCalls.push("load");
      return 23;
    },
    persistHighScore(score) {
      return score;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();

  assert.equal(loadCalls.length, 1);
  assert.equal(sceneModule.getMainSceneStateSnapshot().highScore, 23);
  assert.equal(sceneModule.getMainSceneStateSnapshot().phase, "start");
});

test("MainScene persists high score when a run ends", async () => {
  const persistedScores = [];
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 3;
    },
    persistHighScore(score) {
      persistedScores.push(score);
      return score + 2;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();
  scene.startRun();
  scene.addScore(7);
  scene.time.now = 140;
  scene.endRun();

  assert.deepEqual(persistedScores, [7]);
  assert.equal(sceneModule.getMainSceneStateSnapshot().phase, "game-over");
  assert.equal(sceneModule.getMainSceneStateSnapshot().elapsedSurvivalMs, 140);
  assert.equal(sceneModule.getMainSceneStateSnapshot().highScore, 9);
});

test("MainScene starts a run from pointer input for mobile controls", async () => {
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 0;
    },
    persistHighScore(score) {
      return score;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();

  assert.equal(sceneModule.getMainSceneStateSnapshot().phase, "start");
  scene.time.now = 32;
  scene.input.emit("pointerdown");

  assert.equal(sceneModule.getMainSceneStateSnapshot().phase, "playing");
});

test("MainScene transitions to game-over when snake hits a wall", async () => {
  const persistedScores = [];
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 0;
    },
    persistHighScore(score) {
      persistedScores.push(score);
      return score;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();
  scene.startRun();
  scene.time.now = 4000;
  scene.update(4000);

  assert.equal(sceneModule.getMainSceneStateSnapshot().phase, "game-over");
  assert.equal(sceneModule.getMainSceneStateSnapshot().elapsedSurvivalMs, 4000);
  assert.deepEqual(persistedScores, [0]);
});

test("MainScene transitions to game-over when snake collides with itself", async () => {
  const persistedScores = [];
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 0;
    },
    persistHighScore(score) {
      persistedScores.push(score);
      return score;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();
  scene.startRun();
  scene.snake = {
    stepDurationMs: 120,
    head: { x: 12, y: 12 },
    tick() {
      return 1;
    },
    getSegments() {
      return [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 12, y: 12 },
      ];
    },
    bindKeyboardControls() {},
    unbindKeyboardControls() {},
    bindTouchControls() {},
    unbindTouchControls() {},
  };
  scene.time.now = 240;
  scene.update(240);

  assert.equal(sceneModule.getMainSceneStateSnapshot().phase, "game-over");
  assert.equal(sceneModule.getMainSceneStateSnapshot().elapsedSurvivalMs, 240);
  assert.deepEqual(persistedScores, [0]);
});

test("MainScene resetForReplay restores deterministic snake and overlay state", async () => {
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 17;
    },
    persistHighScore(score) {
      return score;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();
  scene.startRun();
  scene.snake.grow(2);
  scene.snake.queueDirection("down");
  scene.snake.step();
  scene.addScore(4);

  const mutatedSegments = toPlain(scene.snake.getSegments());
  scene.resetForReplay();
  const resetSegments = toPlain(scene.snake.getSegments());
  const resetSnapshot = sceneModule.getMainSceneStateSnapshot();

  scene.startRun();
  const replaySegments = toPlain(scene.snake.getSegments());

  assert.notDeepEqual(resetSegments, mutatedSegments);
  assert.deepEqual(resetSegments, [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ]);
  assert.deepEqual(replaySegments, resetSegments);
  assert.equal(scene.snake.direction, "right");
  assert.deepEqual(toPlain(scene.snake.queuedDirections), []);
  assert.equal(resetSnapshot.phase, "start");
  assert.equal(resetSnapshot.score, 0);
  assert.equal(resetSnapshot.elapsedSurvivalMs, 0);
  assert.equal(resetSnapshot.highScore, 17);
});

test("requestMainSceneReplay resets scene state and starts a fresh run", async () => {
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 11;
    },
    persistHighScore(score) {
      return score;
    },
  });

  const scene = new sceneModule.MainScene();
  scene.create();
  scene.startRun();
  scene.addScore(6);
  scene.time.now = 1200;
  scene.endRun();

  const replayAccepted = sceneModule.requestMainSceneReplay();
  const replaySnapshot = sceneModule.getMainSceneStateSnapshot();

  assert.equal(replayAccepted, true);
  assert.equal(replaySnapshot.phase, "playing");
  assert.equal(replaySnapshot.score, 0);
  assert.equal(replaySnapshot.elapsedSurvivalMs, 0);
  assert.equal(replaySnapshot.highScore, 11);
  assert.deepEqual(toPlain(scene.snake.getSegments()), [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ]);
});

test("requestMainSceneReplay is ignored without an active scene in game-over phase", async () => {
  const sceneModule = await loadMainSceneModule({
    loadHighScore() {
      return 0;
    },
    persistHighScore(score) {
      return score;
    },
  });

  assert.equal(sceneModule.requestMainSceneReplay(), false);
});
