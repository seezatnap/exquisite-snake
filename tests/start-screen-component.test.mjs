import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function loadStartScreenComponent(mockRequire) {
  const source = await readFile(
    path.join(projectRoot, "src/components/StartScreen.tsx"),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "StartScreen.tsx",
  });

  const compiledModule = { exports: {} };
  const context = vm.createContext({
    module: compiledModule,
    exports: compiledModule.exports,
    require: mockRequire,
    Promise,
    setTimeout,
    clearTimeout,
  });

  vm.runInContext(transpiled.outputText, context, {
    filename: "StartScreen.cjs",
  });

  return compiledModule.exports.default ?? compiledModule.exports;
}

function areDepsEqual(previousDeps, nextDeps) {
  if (!Array.isArray(previousDeps) || !Array.isArray(nextDeps)) {
    return false;
  }

  if (previousDeps.length !== nextDeps.length) {
    return false;
  }

  return previousDeps.every((dependency, index) =>
    Object.is(dependency, nextDeps[index]),
  );
}

function createRenderer(Component) {
  const runtime = {
    component: Component,
    tree: null,
    hooks: [],
    effects: [],
    nextEffects: [],
    hookIndex: 0,
    isRendering: false,
    pendingRender: false,
  };

  function requestRender() {
    if (runtime.isRendering) {
      runtime.pendingRender = true;
      return;
    }

    render();
  }

  function useState(initialValue) {
    const stateIndex = runtime.hookIndex++;

    if (!Object.prototype.hasOwnProperty.call(runtime.hooks, stateIndex)) {
      runtime.hooks[stateIndex] =
        typeof initialValue === "function" ? initialValue() : initialValue;
    }

    const setState = (nextValueOrUpdater) => {
      const currentValue = runtime.hooks[stateIndex];
      const nextValue =
        typeof nextValueOrUpdater === "function"
          ? nextValueOrUpdater(currentValue)
          : nextValueOrUpdater;

      if (Object.is(currentValue, nextValue)) {
        return;
      }

      runtime.hooks[stateIndex] = nextValue;
      requestRender();
    };

    return [runtime.hooks[stateIndex], setState];
  }

  function useEffect(effect, deps) {
    const effectIndex = runtime.hookIndex++;
    const previousEffect = runtime.effects[effectIndex];
    const nextDeps = Array.isArray(deps) ? deps : null;
    const shouldRun =
      !previousEffect || !areDepsEqual(previousEffect.deps, nextDeps);

    runtime.nextEffects[effectIndex] = {
      deps: nextDeps,
      effect,
      cleanup: previousEffect?.cleanup,
      shouldRun,
    };
  }

  function useMemo(factory, deps) {
    const memoIndex = runtime.hookIndex++;
    const previousMemo = runtime.hooks[memoIndex];
    const nextDeps = Array.isArray(deps) ? deps : null;

    if (previousMemo && areDepsEqual(previousMemo.deps, nextDeps)) {
      return previousMemo.value;
    }

    const value = factory();
    runtime.hooks[memoIndex] = { deps: nextDeps, value };
    return value;
  }

  function commitEffects() {
    const previousEffects = runtime.effects;
    const nextEffects = runtime.nextEffects;
    const maxLength = Math.max(previousEffects.length, nextEffects.length);

    for (let index = 0; index < maxLength; index += 1) {
      const previousEffect = previousEffects[index];
      const nextEffect = nextEffects[index];

      if (!nextEffect) {
        previousEffect?.cleanup?.();
        continue;
      }

      if (nextEffect.shouldRun) {
        previousEffect?.cleanup?.();
        const cleanup = nextEffect.effect();
        nextEffect.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        continue;
      }

      nextEffect.cleanup = previousEffect?.cleanup;
    }

    runtime.effects = nextEffects;
    runtime.nextEffects = [];
  }

  function render() {
    if (runtime.isRendering) {
      runtime.pendingRender = true;
      return;
    }

    runtime.isRendering = true;

    do {
      runtime.pendingRender = false;
      runtime.hookIndex = 0;
      runtime.nextEffects = [];
      runtime.tree = runtime.component();
      commitEffects();
    } while (runtime.pendingRender);

    runtime.isRendering = false;
  }

  function unmount() {
    for (let index = runtime.effects.length - 1; index >= 0; index -= 1) {
      runtime.effects[index]?.cleanup?.();
    }

    runtime.effects = [];
    runtime.nextEffects = [];
    runtime.tree = null;
  }

  return {
    useState,
    useEffect,
    useMemo,
    render,
    unmount,
    getTree() {
      return runtime.tree;
    },
  };
}

function jsx(type, props) {
  return {
    type,
    props: props ?? {},
  };
}

function collectText(node, output = []) {
  if (node == null || typeof node === "boolean") {
    return output;
  }

  if (typeof node === "string" || typeof node === "number") {
    output.push(String(node));
    return output;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectText(child, output);
    }

    return output;
  }

  collectText(node.props?.children, output);
  return output;
}

function getRenderedText(tree) {
  return collectText(tree).join(" ").replace(/\s+/g, " ").trim();
}

function findFirstNodeByType(node, type) {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findFirstNodeByType(child, type);
      if (match) {
        return match;
      }
    }

    return null;
  }

  if (node.type === type) {
    return node;
  }

  return findFirstNodeByType(node.props?.children, type);
}

function createBridgeMock(initialState) {
  let state = {
    phase: "start",
    score: 0,
    highScore: 0,
    elapsedSurvivalMs: 0,
    ...initialState,
  };
  let startRequests = 0;
  const listeners = new Set();

  return {
    moduleExports: {
      getMainSceneStateSnapshot() {
        return state;
      },
      subscribeToMainSceneState(listener) {
        listeners.add(listener);
        listener(state);

        return () => {
          listeners.delete(listener);
        };
      },
      requestMainSceneStart() {
        startRequests += 1;
        state = {
          ...state,
          phase: "playing",
          score: 0,
          elapsedSurvivalMs: 0,
        };

        for (const listener of [...listeners]) {
          listener(state);
        }

        return true;
      },
    },
    emit(nextPatch) {
      state = {
        ...state,
        ...nextPatch,
      };

      for (const listener of [...listeners]) {
        listener(state);
      }
    },
    listenerCount() {
      return listeners.size;
    },
    startRequestCount() {
      return startRequests;
    },
  };
}

async function flushMicrotasks(iterations = 8) {
  for (let count = 0; count < iterations; count += 1) {
    await Promise.resolve();
  }
}

async function createHarness({
  persistedHighScore = 0,
  bridgeState = {},
} = {}) {
  const bridge = createBridgeMock(bridgeState);
  const reactMock = {};
  const rendererRef = { current: null };

  function mockRequire(specifier) {
    if (specifier === "react") {
      return reactMock;
    }

    if (specifier === "react/jsx-runtime") {
      return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
    }

    if (specifier === "@/game/utils/storage") {
      return {
        loadHighScore() {
          return persistedHighScore;
        },
      };
    }

    if (specifier === "@/game/scenes/MainScene") {
      return bridge.moduleExports;
    }

    throw new Error(`Unexpected module request: ${specifier}`);
  }

  const StartScreen = await loadStartScreenComponent(mockRequire);
  const renderer = createRenderer(StartScreen);
  rendererRef.current = renderer;

  reactMock.useState = (...args) => rendererRef.current.useState(...args);
  reactMock.useEffect = (...args) => rendererRef.current.useEffect(...args);
  reactMock.useMemo = (...args) => rendererRef.current.useMemo(...args);

  renderer.render();
  await flushMicrotasks();

  return {
    bridge,
    unmount() {
      renderer.unmount();
    },
    isVisible() {
      return renderer.getTree() !== null;
    },
    getText() {
      return getRenderedText(renderer.getTree());
    },
    getStartButton() {
      return findFirstNodeByType(renderer.getTree(), "button");
    },
    clickStartAction() {
      const button = findFirstNodeByType(renderer.getTree(), "button");

      if (!button?.props?.onClick) {
        throw new Error("Start action button was not rendered");
      }

      button.props.onClick();
    },
  };
}

test("StartScreen renders persisted high score and bridge updates while in start phase", async () => {
  const harness = await createHarness({
    persistedHighScore: 12,
    bridgeState: {
      phase: "start",
      highScore: 7,
    },
  });

  assert.equal(harness.isVisible(), true);
  assert.match(harness.getText(), /High Score/);
  assert.match(harness.getText(), /0012/);

  harness.bridge.emit({
    phase: "start",
    highScore: 37,
  });

  assert.equal(harness.isVisible(), true);
  assert.match(harness.getText(), /0037/);

  harness.unmount();
});

test("StartScreen visibility follows bridge phase transitions between start and non-start", async () => {
  const harness = await createHarness({
    persistedHighScore: 5,
    bridgeState: {
      phase: "start",
      highScore: 5,
    },
  });

  assert.equal(harness.isVisible(), true);
  assert.match(harness.getText(), /Press any key/);
  assert.equal(harness.getStartButton()?.props?.autoFocus, true);
  assert.equal(harness.bridge.listenerCount(), 1);

  harness.bridge.emit({ phase: "playing" });
  assert.equal(harness.isVisible(), false);

  harness.bridge.emit({ phase: "game-over" });
  assert.equal(harness.isVisible(), false);

  harness.bridge.emit({ phase: "start", highScore: 9 });
  assert.equal(harness.isVisible(), true);
  assert.match(harness.getText(), /0009/);

  harness.unmount();
  assert.equal(harness.bridge.listenerCount(), 0);
});

test("StartScreen start action requests the MainScene start transition", async () => {
  const harness = await createHarness({
    persistedHighScore: 2,
    bridgeState: {
      phase: "start",
      highScore: 2,
    },
  });

  assert.equal(harness.isVisible(), true);
  harness.clickStartAction();

  assert.equal(harness.bridge.startRequestCount(), 1);
  assert.equal(harness.isVisible(), false);

  harness.unmount();
});
