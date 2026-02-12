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

async function loadSnakeModule() {
  const [gridSource, snakeSource] = await Promise.all([
    readFile(path.join(projectRoot, "src/game/utils/grid.ts"), "utf8"),
    readFile(path.join(projectRoot, "src/game/entities/Snake.ts"), "utf8"),
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

  const snakeModule = { exports: {} };
  const snakeContext = vm.createContext({
    module: snakeModule,
    exports: snakeModule.exports,
    require(specifier) {
      if (specifier === "../utils/grid") {
        return gridModule.exports;
      }

      throw new Error(`Unexpected module request: ${specifier}`);
    },
  });

  vm.runInContext(transpile(snakeSource, "Snake.ts"), snakeContext, {
    filename: "Snake.cjs",
  });

  return snakeModule.exports;
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

test("Snake maps arrow keys and WASD inputs to directions", async () => {
  const snakeModule = await loadSnakeModule();

  assert.equal(snakeModule.keyboardInputToDirection({ key: "ArrowUp" }), "up");
  assert.equal(snakeModule.keyboardInputToDirection({ key: "W" }), "up");
  assert.equal(snakeModule.keyboardInputToDirection({ key: "d" }), "right");
  assert.equal(snakeModule.keyboardInputToDirection({ code: "KeyA" }), "left");
  assert.equal(snakeModule.keyboardInputToDirection({ code: "ArrowDown" }), "down");
  assert.equal(snakeModule.keyboardInputToDirection({ key: "Enter" }), null);
});

test("Snake maps swipe gestures into dominant-axis directions", async () => {
  const snakeModule = await loadSnakeModule();

  assert.equal(
    snakeModule.swipeInputToDirection({
      startX: 20,
      startY: 20,
      endX: 60,
      endY: 24,
    }),
    "right",
  );
  assert.equal(
    snakeModule.swipeInputToDirection({
      startX: 80,
      startY: 25,
      endX: 28,
      endY: 20,
    }),
    "left",
  );
  assert.equal(
    snakeModule.swipeInputToDirection(
      {
        startX: 40,
        startY: 80,
        endX: 44,
        endY: 24,
      },
      20,
    ),
    "up",
  );
  assert.equal(
    snakeModule.swipeInputToDirection(
      {
        startX: 100,
        startY: 10,
        endX: 90,
        endY: 36,
      },
      20,
    ),
    "down",
  );
  assert.equal(
    snakeModule.swipeInputToDirection({
      startX: 12,
      startY: 8,
      endX: 26,
      endY: 12,
    }),
    null,
  );
});

test("Snake buffers turns while rejecting 180-degree reversals", async () => {
  const snakeModule = await loadSnakeModule();
  const snake = new snakeModule.Snake({
    initialHeadPosition: { x: 5, y: 5 },
    initialDirection: "right",
    inputBufferSize: 2,
  });

  assert.equal(snake.queueDirection("left"), false);
  assert.equal(snake.queueDirection("up"), true);
  assert.equal(snake.queueDirection("down"), false);
  assert.equal(snake.queueDirection("left"), true);
  assert.equal(snake.queueDirection("up"), false);
  assert.deepEqual(toPlain(snake.queuedDirections), ["up", "left"]);
});

test("Snake queues swipe input through the same buffered turn rules", async () => {
  const snakeModule = await loadSnakeModule();
  const snake = new snakeModule.Snake({
    initialHeadPosition: { x: 5, y: 5 },
    initialDirection: "right",
    touchSwipeThresholdPx: 16,
    touchSwipeDebounceMs: 90,
  });

  assert.equal(
    snake.queueDirectionFromSwipe({
      startX: 50,
      startY: 80,
      endX: 50,
      endY: 20,
      eventTimeMs: 100,
    }),
    true,
  );
  assert.equal(
    snake.queueDirectionFromSwipe({
      startX: 40,
      startY: 20,
      endX: 10,
      endY: 20,
      eventTimeMs: 140,
    }),
    false,
  );
  assert.equal(
    snake.queueDirectionFromSwipe({
      startX: 40,
      startY: 20,
      endX: 10,
      endY: 20,
      eventTimeMs: 220,
    }),
    true,
  );
  assert.equal(
    snake.queueDirectionFromSwipe({
      startX: 10,
      startY: 10,
      endX: 50,
      endY: 14,
      eventTimeMs: 400,
    }),
    false,
  );
  assert.deepEqual(toPlain(snake.queuedDirections), ["up", "left"]);
});

test("Snake consumes buffered turns in order across movement steps", async () => {
  const snakeModule = await loadSnakeModule();
  const snake = new snakeModule.Snake({
    initialHeadPosition: { x: 5, y: 5 },
    initialDirection: "right",
    initialLength: 3,
  });

  snake.queueDirection("up");
  snake.queueDirection("left");

  assert.deepEqual(toPlain(snake.step()), { x: 5, y: 4 });
  assert.equal(snake.direction, "up");
  assert.deepEqual(toPlain(snake.step()), { x: 4, y: 4 });
  assert.equal(snake.direction, "left");
  assert.deepEqual(toPlain(snake.getSegments()), [
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 5, y: 5 },
  ]);
});

test("Snake growth keeps tail segments and works with fixed-step tick timing", async () => {
  const snakeModule = await loadSnakeModule();
  const snake = new snakeModule.Snake({
    initialHeadPosition: { x: 2, y: 2 },
    initialDirection: "right",
    initialLength: 2,
    stepDurationMs: 100,
  });

  snake.grow(2);
  assert.equal(snake.pendingGrowth, 2);

  assert.equal(snake.tick(90), 0);
  assert.equal(snake.interpolationAlpha, 0.9);
  assert.deepEqual(toPlain(snake.head), { x: 2, y: 2 });

  assert.equal(snake.tick(10), 1);
  assert.equal(snake.length, 3);
  assert.equal(snake.pendingGrowth, 1);

  assert.equal(snake.tick(100), 1);
  assert.equal(snake.length, 4);
  assert.equal(snake.pendingGrowth, 0);

  assert.equal(snake.tick(100), 1);
  assert.equal(snake.length, 4);
  assert.deepEqual(toPlain(snake.head), { x: 5, y: 2 });
});

test("Snake keyboard binding prevents defaults for mapped keys, including rejected turns", async () => {
  const snakeModule = await loadSnakeModule();
  const snake = new snakeModule.Snake({
    initialHeadPosition: { x: 4, y: 4 },
    initialDirection: "up",
    inputBufferSize: 2,
  });

  let onCallCount = 0;
  let offCallCount = 0;
  let listenerRef;
  let listenerContext;
  const keyboard = {
    on(eventName, listener, context) {
      onCallCount += 1;
      assert.equal(eventName, "keydown");
      listenerRef = listener;
      listenerContext = context;
    },
    off(eventName, listener, context) {
      offCallCount += 1;
      assert.equal(eventName, "keydown");
      assert.equal(listener, listenerRef);
      assert.equal(context, listenerContext);
    },
  };

  snake.bindKeyboardControls(keyboard);
  snake.bindKeyboardControls(keyboard);
  assert.equal(onCallCount, 1);

  let preventedCount = 0;
  const emitKey = (key) => {
    listenerRef.call(listenerContext, {
      key,
      preventDefault() {
        preventedCount += 1;
      },
    });
  };

  emitKey("d"); // accepted
  emitKey("a"); // rejected opposite
  emitKey("d"); // rejected duplicate
  emitKey("w"); // accepted (fills buffer)
  emitKey("d"); // rejected full buffer
  emitKey("Enter"); // unmapped, should not prevent default

  assert.equal(preventedCount, 5);
  assert.deepEqual(toPlain(snake.queuedDirections), ["right", "up"]);

  snake.unbindKeyboardControls();
  assert.equal(offCallCount, 1);
});

test("Snake touch binding queues swipes and unregisters cleanly", async () => {
  const snakeModule = await loadSnakeModule();
  const snake = new snakeModule.Snake({
    initialHeadPosition: { x: 4, y: 4 },
    initialDirection: "right",
  });

  const listenersByEvent = new Map();
  const contextsByEvent = new Map();
  let onCallCount = 0;
  let offCallCount = 0;

  const touchEmitter = {
    on(eventName, listener, context) {
      onCallCount += 1;
      listenersByEvent.set(eventName, listener);
      contextsByEvent.set(eventName, context);
    },
    off(eventName, listener, context) {
      offCallCount += 1;
      assert.equal(listener, listenersByEvent.get(eventName));
      assert.equal(context, contextsByEvent.get(eventName));
    },
  };

  snake.bindTouchControls(touchEmitter);
  snake.bindTouchControls(touchEmitter);
  assert.equal(onCallCount, 2);

  listenersByEvent.get("pointerdown").call(contextsByEvent.get("pointerdown"), {
    id: 9,
    x: 100,
    y: 100,
  });
  listenersByEvent.get("pointerup").call(contextsByEvent.get("pointerup"), {
    id: 9,
    x: 104,
    y: 40,
    upTime: 500,
  });

  listenersByEvent.get("pointerdown").call(contextsByEvent.get("pointerdown"), {
    id: 9,
    x: 120,
    y: 42,
  });
  listenersByEvent.get("pointerup").call(contextsByEvent.get("pointerup"), {
    id: 9,
    x: 80,
    y: 42,
    upTime: 540,
  });

  listenersByEvent.get("pointerdown").call(contextsByEvent.get("pointerdown"), {
    id: 9,
    x: 120,
    y: 42,
  });
  listenersByEvent.get("pointerup").call(contextsByEvent.get("pointerup"), {
    id: 9,
    x: 80,
    y: 42,
    upTime: 620,
  });

  assert.deepEqual(toPlain(snake.queuedDirections), ["up", "left"]);

  snake.unbindTouchControls();
  assert.equal(offCallCount, 2);
});
