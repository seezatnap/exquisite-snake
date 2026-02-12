import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function loadStorageModule(windowValue) {
  const source = await readFile(
    path.join(projectRoot, "src/game/utils/storage.ts"),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "storage.ts",
  });

  const compiledModule = { exports: {} };
  const context = vm.createContext({
    module: compiledModule,
    exports: compiledModule.exports,
    require(specifier) {
      throw new Error(`Unexpected module request: ${specifier}`);
    },
    window: windowValue,
  });

  vm.runInContext(transpiled.outputText, context, { filename: "storage.cjs" });

  return compiledModule.exports;
}

function createLocalStorage(seed = {}) {
  const backingStore = new Map(
    Object.entries(seed).map(([key, value]) => [key, String(value)]),
  );

  return {
    getItem(key) {
      return backingStore.has(key) ? backingStore.get(key) : null;
    },
    setItem(key, value) {
      backingStore.set(key, String(value));
    },
  };
}

test("storage helpers load from and persist into localStorage", async () => {
  const localStorage = createLocalStorage({
    "exquisite-snake.high-score": "7",
  });
  const { HIGH_SCORE_STORAGE_KEY, loadHighScore, persistHighScore } =
    await loadStorageModule({ localStorage });

  assert.equal(HIGH_SCORE_STORAGE_KEY, "exquisite-snake.high-score");
  assert.equal(loadHighScore(), 7);
  assert.equal(persistHighScore(3), 7);
  assert.equal(persistHighScore(10), 10);
  assert.equal(localStorage.getItem(HIGH_SCORE_STORAGE_KEY), "10");
});

test("storage helpers keep working when localStorage is unavailable", async () => {
  const { loadHighScore, persistHighScore } = await loadStorageModule(undefined);

  assert.equal(loadHighScore(), 0);
  assert.equal(persistHighScore(12.8), 12);
  assert.equal(loadHighScore(), 12);
  assert.equal(persistHighScore(-5), 12);
  assert.equal(persistHighScore(Number.NaN), 12);
});

test("storage helpers handle malformed values and storage API exceptions", async () => {
  const malformedStorage = createLocalStorage({
    "exquisite-snake.high-score": "not-a-number",
  });
  const malformedModule = await loadStorageModule({ localStorage: malformedStorage });

  assert.equal(malformedModule.loadHighScore(), 0);
  assert.equal(malformedModule.persistHighScore(4), 4);

  const unstableModule = await loadStorageModule({
    get localStorage() {
      throw new Error("storage access blocked");
    },
  });

  assert.equal(unstableModule.loadHighScore(), 0);
  assert.equal(unstableModule.persistHighScore(5), 5);
  assert.equal(unstableModule.loadHighScore(), 5);
});
