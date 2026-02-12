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

async function loadFoodModule() {
  const [gridSource, foodSource] = await Promise.all([
    readFile(path.join(projectRoot, "src/game/utils/grid.ts"), "utf8"),
    readFile(path.join(projectRoot, "src/game/entities/Food.ts"), "utf8"),
  ]);

  const gridModule = { exports: {} };
  const gridContext = vm.createContext({
    module: gridModule,
    exports: gridModule.exports,
    require(specifier) {
      if (specifier === "../config") {
        return MOCK_CONFIG;
      }

      throw new Error(`Unexpected module request: ${specifier}`);
    },
  });

  vm.runInContext(transpile(gridSource, "grid.ts"), gridContext, {
    filename: "grid.cjs",
  });

  const foodModule = { exports: {} };
  const foodContext = vm.createContext({
    module: foodModule,
    exports: foodModule.exports,
    require(specifier) {
      if (specifier === "../utils/grid") {
        return gridModule.exports;
      }

      if (specifier === "../config") {
        return MOCK_CONFIG;
      }

      throw new Error(`Unexpected module request: ${specifier}`);
    },
  });

  vm.runInContext(transpile(foodSource, "Food.ts"), foodContext, {
    filename: "Food.cjs",
  });

  return foodModule.exports;
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

test("Food spawns only into open cells and avoids snake segments", async () => {
  const foodModule = await loadFoodModule();
  const food = new foodModule.Food({
    bounds: { cols: 3, rows: 2 },
    random: () => 0.99,
  });

  const spawnPosition = food.spawn([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ]);

  assert.deepEqual(toPlain(spawnPosition), { x: 2, y: 1 });
  assert.deepEqual(toPlain(food.currentPosition), { x: 2, y: 1 });
});

test("Food tryEat triggers score hooks, snake growth, and safe respawn", async () => {
  const foodModule = await loadFoodModule();
  const scoreCalls = [];
  const growthCalls = [];

  const food = new foodModule.Food({
    bounds: { cols: 4, rows: 1 },
    scoreValue: 5,
    growthSegments: 2,
    onScore(points) {
      scoreCalls.push(points);
    },
    random: () => 0,
  });

  const snakeState = {
    segments: [
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
  };
  const snake = {
    get head() {
      return snakeState.segments[0];
    },
    getSegments() {
      return snakeState.segments.map((segment) => ({ ...segment }));
    },
    grow(segments = 1) {
      growthCalls.push(segments);
    },
  };

  assert.deepEqual(toPlain(food.spawnForSnake(snake)), { x: 2, y: 0 });

  snakeState.segments = [
    { x: 2, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ];

  assert.equal(food.tryEat(snake), true);
  assert.deepEqual(growthCalls, [2]);
  assert.deepEqual(scoreCalls, [5]);
  assert.deepEqual(toPlain(food.currentPosition), { x: 3, y: 0 });
});

test("Food tryEat is a no-op when snake head does not touch food", async () => {
  const foodModule = await loadFoodModule();
  const scoreCalls = [];
  const growthCalls = [];

  const food = new foodModule.Food({
    bounds: { cols: 3, rows: 1 },
    onScore(points) {
      scoreCalls.push(points);
    },
    random: () => 0,
  });

  const snake = {
    head: { x: 0, y: 0 },
    getSegments() {
      return [{ x: 0, y: 0 }];
    },
    grow(segments = 1) {
      growthCalls.push(segments);
    },
  };

  assert.deepEqual(toPlain(food.spawnForSnake(snake)), { x: 1, y: 0 });
  assert.equal(food.tryEat(snake), false);
  assert.deepEqual(growthCalls, []);
  assert.deepEqual(scoreCalls, []);
  assert.deepEqual(toPlain(food.currentPosition), { x: 1, y: 0 });
});

test("Food clears its position when the grid has no free spawn cells", async () => {
  const foodModule = await loadFoodModule();
  const food = new foodModule.Food({
    bounds: { cols: 2, rows: 1 },
    random: () => 0.5,
  });

  assert.equal(
    food.spawn([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]),
    null,
  );
  assert.equal(food.currentPosition, null);
});
