import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function loadMainSceneModule(storageModule) {
  const source = await readFile(
    path.join(projectRoot, "src/game/scenes/MainScene.ts"),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "MainScene.ts",
  });

  class MockKeyboard {
    on() {}
    off() {}
  }

  class MockEvents {
    once() {}
  }

  class MockScene {
    constructor() {
      this.time = { now: 0 };
      this.events = new MockEvents();
      this.input = {
        keyboard: new MockKeyboard(),
      };
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

      throw new Error(`Unexpected module request: ${specifier}`);
    },
  });

  vm.runInContext(transpiled.outputText, context, { filename: "MainScene.cjs" });

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
