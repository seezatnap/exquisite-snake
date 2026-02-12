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

async function loadGridUtils() {
  const source = await readFile(
    path.join(projectRoot, "src/game/utils/grid.ts"),
    "utf8",
  );

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "grid.ts",
  });

  const compiledModule = { exports: {} };
  const context = vm.createContext({
    module: compiledModule,
    exports: compiledModule.exports,
    require(specifier) {
      if (specifier === "../config") {
        return MOCK_CONFIG;
      }

      throw new Error(`Unexpected module request: ${specifier}`);
    },
  });

  vm.runInContext(transpiled.outputText, context, { filename: "grid.cjs" });

  return compiledModule.exports;
}

test("grid directions and position helpers support deterministic tile movement", async () => {
  const gridUtils = await loadGridUtils();

  assert.deepEqual([...gridUtils.CARDINAL_DIRECTIONS], [
    "up",
    "right",
    "down",
    "left",
  ]);

  const up = gridUtils.directionToVector("up");
  assert.equal(up.x, 0);
  assert.equal(up.y, -1);

  assert.equal(gridUtils.getOppositeDirection("left"), "right");
  assert.equal(gridUtils.isOppositeDirection("up", "down"), true);
  assert.equal(gridUtils.isOppositeDirection("up", "left"), false);

  const translated = gridUtils.translateGridPosition({ x: 5, y: 5 }, { x: -1, y: 0 });
  assert.equal(translated.x, 4);
  assert.equal(translated.y, 5);

  const advanced = gridUtils.advanceGridPosition({ x: 10, y: 10 }, "down", 2);
  assert.equal(advanced.x, 10);
  assert.equal(advanced.y, 12);

  assert.equal(gridUtils.toGridKey({ x: 2, y: 9 }), "2,9");
  assert.equal(
    gridUtils.areGridPositionsEqual({ x: 7, y: 8 }, { x: 7, y: 8 }),
    true,
  );
  assert.equal(
    gridUtils.areGridPositionsEqual({ x: 7, y: 8 }, { x: 8, y: 8 }),
    false,
  );
  assert.equal(gridUtils.isWithinGridBounds({ x: 39, y: 29 }), true);
  assert.equal(gridUtils.isWithinGridBounds({ x: 40, y: 29 }), false);
  assert.equal(gridUtils.isWithinGridBounds({ x: 39, y: 30 }), false);
});

test("grid <-> world conversion and interpolation produce smooth in-between positions", async () => {
  const gridUtils = await loadGridUtils();

  const centerOrigin = gridUtils.gridToWorldPosition({ x: 0, y: 0 });
  assert.equal(centerOrigin.x, 12);
  assert.equal(centerOrigin.y, 12);

  const topLeft = gridUtils.gridToWorldPosition({ x: 2, y: 3 }, 24, "top-left");
  assert.equal(topLeft.x, 48);
  assert.equal(topLeft.y, 72);

  const cellFromWorld = gridUtils.worldToGridPosition({ x: 47.9, y: 72 });
  assert.equal(cellFromWorld.x, 1);
  assert.equal(cellFromWorld.y, 3);

  const halfwayCell = gridUtils.interpolateGridPosition(
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    0.5,
  );
  assert.equal(halfwayCell.x, 1.5);
  assert.equal(halfwayCell.y, 1);

  const halfwayWorld = gridUtils.interpolateWorldPosition(
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    0.5,
  );
  assert.equal(halfwayWorld.x, 24);
  assert.equal(halfwayWorld.y, 12);

  assert.equal(gridUtils.clampInterpolationAlpha(-1), 0);
  assert.equal(gridUtils.clampInterpolationAlpha(2), 1);
  assert.equal(gridUtils.clampInterpolationAlpha(Number.NaN), 0);

  assert.equal(gridUtils.getStepInterpolationAlpha(30, 120), 0.25);
  assert.equal(gridUtils.getStepInterpolationAlpha(240, 120), 1);
  assert.equal(gridUtils.getStepInterpolationFromTimestamps(130, 100, 120), 0.25);
});

test("grid step clock accumulates fixed-step updates and retains interpolation progress", async () => {
  const gridUtils = await loadGridUtils();

  const clock = new gridUtils.GridStepClock(120);
  assert.equal(clock.durationMs, 120);
  assert.equal(clock.elapsedMs, 0);
  assert.equal(clock.interpolationAlpha, 0);

  assert.equal(clock.tick(60), 0);
  assert.equal(clock.elapsedMs, 60);
  assert.equal(clock.interpolationAlpha, 0.5);

  assert.equal(clock.tick(60), 1);
  assert.equal(clock.elapsedMs, 0);
  assert.equal(clock.interpolationAlpha, 0);

  assert.equal(clock.tick(250), 2);
  assert.equal(clock.elapsedMs, 10);
  assert.equal(clock.interpolationAlpha, 10 / 120);

  clock.reset(0.25);
  assert.equal(clock.elapsedMs, 30);
  assert.equal(clock.interpolationAlpha, 0.25);

  clock.setStepDuration(60);
  assert.equal(clock.durationMs, 60);
  assert.equal(clock.elapsedMs, 15);
  assert.equal(clock.interpolationAlpha, 0.25);

  assert.equal(clock.tick(-100), 0);
  assert.equal(clock.elapsedMs, 15);

  const fallbackClock = new gridUtils.GridStepClock(0);
  assert.equal(fallbackClock.durationMs, gridUtils.DEFAULT_GRID_STEP_DURATION_MS);

  const createdClock = gridUtils.createGridStepClock(90);
  assert.equal(createdClock.durationMs, 90);
});
