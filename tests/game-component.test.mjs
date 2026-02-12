import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

class MockElement {
  constructor(tagName, forceConnected = false) {
    this.tagName = tagName.toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.className = "";
    this.style = {};
    this.tabIndex = undefined;
    this.focusCalls = 0;
    this._forceConnected = forceConnected;
    this._clientWidth = 0;
    this._clientHeight = 0;
  }

  setSize(width, height) {
    this._clientWidth = Math.max(0, Number(width) || 0);
    this._clientHeight = Math.max(0, Number(height) || 0);
  }

  get clientWidth() {
    if (this._clientWidth > 0) {
      return this._clientWidth;
    }

    return this.parentNode?.clientWidth ?? 0;
  }

  get clientHeight() {
    if (this._clientHeight > 0) {
      return this._clientHeight;
    }

    return this.parentNode?.clientHeight ?? 0;
  }

  getBoundingClientRect() {
    const width = this.clientWidth;
    const height = this.clientHeight;

    return {
      width,
      height,
      top: 0,
      right: width,
      bottom: height,
      left: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    };
  }

  get isConnected() {
    if (this._forceConnected) {
      return true;
    }

    return Boolean(this.parentNode?.isConnected);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);

    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }

    return child;
  }

  replaceChildren(...nextChildren) {
    for (const child of this.children) {
      child.parentNode = null;
    }

    this.children = [];

    for (const child of nextChildren) {
      this.appendChild(child);
    }
  }

  focus() {
    this.focusCalls += 1;
    MockElement.lastFocusedElement = this;
  }
}

MockElement.lastFocusedElement = null;

async function loadGameComponent(mockRequire, runtimeGlobals = {}) {
  const source = await readFile(
    path.join(projectRoot, "src/components/Game.tsx"),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "Game.tsx",
  });

  const compiledModule = { exports: {} };
  const context = vm.createContext({
    module: compiledModule,
    exports: compiledModule.exports,
    require: mockRequire,
    Promise,
    setTimeout,
    clearTimeout,
    ...runtimeGlobals,
  });

  vm.runInContext(transpiled.outputText, context, { filename: "Game.cjs" });
  return compiledModule.exports;
}

function createEventDispatcher() {
  const listeners = new Map();

  return {
    add(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }

      listeners.get(type).add(listener);
    },
    remove(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      const handlers = listeners.get(type);

      if (!handlers) {
        return;
      }

      for (const handler of [...handlers]) {
        handler({ type });
      }
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function createHarness() {
  const root = new MockElement("root", true);
  root.setSize(1000, 700);
  MockElement.lastFocusedElement = null;

  const destroyCalls = [];
  const gameInstances = [];
  const scaleRefreshCalls = [];
  const resizeObservers = [];
  let resizeObserverDisconnects = 0;
  let currentInstance = null;
  let exportsPromise = null;
  let nextFrameId = 1;
  const frameQueue = new Map();
  const mainSceneListeners = new Set();
  let mainSceneState = {
    phase: "start",
    score: 0,
    highScore: 0,
    elapsedSurvivalMs: 0,
  };

  const windowEvents = createEventDispatcher();
  const visualViewportEvents = createEventDispatcher();

  const windowMock = {
    addEventListener(type, listener) {
      windowEvents.add(type, listener);
    },
    removeEventListener(type, listener) {
      windowEvents.remove(type, listener);
    },
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frameQueue.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frameQueue.delete(id);
    },
    visualViewport: {
      addEventListener(type, listener) {
        visualViewportEvents.add(type, listener);
      },
      removeEventListener(type, listener) {
        visualViewportEvents.remove(type, listener);
      },
    },
  };

  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      this.disconnected = false;
      resizeObservers.push(this);
    }

    observe(target) {
      this.targets.add(target);
    }

    disconnect() {
      this.disconnected = true;
      this.targets.clear();
      resizeObserverDisconnects += 1;
    }

    trigger() {
      if (this.disconnected || this.targets.size === 0) {
        return;
      }

      const entries = [...this.targets].map((target) => ({
        target,
        contentRect: target.getBoundingClientRect(),
      }));

      this.callback(entries, this);
    }
  }

  function useRef(initialValue) {
    assert.ok(currentInstance, "useRef was called outside component render");

    const hookIndex = currentInstance.hookIndex++;

    if (!currentInstance.hooks[hookIndex]) {
      currentInstance.hooks[hookIndex] = { current: initialValue };
    }

    return currentInstance.hooks[hookIndex];
  }

  function useEffect(effect) {
    assert.ok(currentInstance, "useEffect was called outside component render");
    currentInstance.hookIndex++;
    currentInstance.pendingEffects.push(effect);
  }

  function jsx(type, props) {
    return { type, props: props ?? {} };
  }

  function dynamic(loader, options) {
    assert.equal(options?.ssr, false);

    return async function DynamicComponent(props) {
      const loaded = await loader();
      const Component = loaded?.default ?? loaded;
      return jsx(Component, props ?? {});
    };
  }

  class PhaserGameMock {
    constructor(config) {
      this.config = config;
      this.canvas = null;
      this.scale = {
        refresh: () => {
          scaleRefreshCalls.push(this);
        },
      };

      if (config.parent) {
        this.canvas = new MockElement("canvas");
        config.parent.appendChild(this.canvas);
      }

      gameInstances.push(this);
    }

    destroy(removeCanvas) {
      destroyCalls.push([removeCanvas]);

      if (removeCanvas && this.canvas?.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }
  }

  function mockRequire(specifier) {
    if (specifier === "next/dynamic") {
      return dynamic;
    }

    if (specifier === "react") {
      return { useEffect, useRef };
    }

    if (specifier === "react/jsx-runtime") {
      return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
    }

    if (specifier === "phaser") {
      return { __esModule: true, default: { Game: PhaserGameMock } };
    }

    if (specifier === "@/game/config") {
      return {
        ARENA_WIDTH: 960,
        ARENA_HEIGHT: 720,
        GRID_COLS: 40,
        GRID_ROWS: 30,
        GAME_CONFIG: {
          width: 960,
          height: 720,
        },
      };
    }

    if (specifier === "@/game/scenes/MainScene") {
      return {
        subscribeToMainSceneState(listener) {
          mainSceneListeners.add(listener);
          listener(mainSceneState);

          return () => {
            mainSceneListeners.delete(listener);
          };
        },
      };
    }

    throw new Error(`Unexpected module request: ${specifier}`);
  }

  async function mountElement(element, parentNode) {
    if (!element) {
      return {
        node: null,
        unmount() {},
      };
    }

    if (typeof element.type === "function") {
      const instance = {
        hooks: [],
        hookIndex: 0,
        pendingEffects: [],
        cleanups: [],
      };
      const previousInstance = currentInstance;
      currentInstance = instance;

      let rendered;
      try {
        rendered = element.type(element.props ?? {});
      } finally {
        currentInstance = previousInstance;
      }

      if (typeof rendered?.then === "function") {
        rendered = await rendered;
      }

      const mountedChild = await mountElement(rendered, parentNode);

      for (const effect of instance.pendingEffects) {
        const cleanup = effect();

        if (typeof cleanup === "function") {
          instance.cleanups.push(cleanup);
        }
      }

      return {
        node: mountedChild.node,
        unmount() {
          for (let index = instance.cleanups.length - 1; index >= 0; index -= 1) {
            instance.cleanups[index]();
          }

          mountedChild.unmount();
        },
      };
    }

    if (typeof element.type === "string") {
      const domNode = new MockElement(element.type);
      const props = element.props ?? {};
      const mountedChildren = [];

      if (typeof props.className === "string") {
        domNode.className = props.className;
      }

      if (Object.prototype.hasOwnProperty.call(props, "tabIndex")) {
        domNode.tabIndex = props.tabIndex;
      }

      if (props.ref && typeof props.ref === "object") {
        props.ref.current = domNode;
      }

      parentNode.appendChild(domNode);

      const children = Array.isArray(props.children)
        ? props.children
        : props.children == null
          ? []
          : [props.children];

      for (const child of children) {
        if (child && typeof child === "object") {
          mountedChildren.push(await mountElement(child, domNode));
        }
      }

      return {
        node: domNode,
        unmount() {
          for (let index = mountedChildren.length - 1; index >= 0; index -= 1) {
            mountedChildren[index].unmount();
          }

          if (props.ref && typeof props.ref === "object") {
            props.ref.current = null;
          }

          if (domNode.parentNode) {
            domNode.parentNode.removeChild(domNode);
          }
        },
      };
    }

    throw new Error("Unsupported element type during test render");
  }

  async function flushMicrotasks(iterations = 10) {
    for (let count = 0; count < iterations; count += 1) {
      await Promise.resolve();
    }
  }

  async function flushAnimationFrames(iterations = 10) {
    for (let count = 0; count < iterations; count += 1) {
      if (frameQueue.size === 0) {
        return;
      }

      const pendingFrames = [...frameQueue.entries()];
      frameQueue.clear();

      for (const [, callback] of pendingFrames) {
        callback(count * 16);
      }

      await Promise.resolve();
    }
  }

  async function getModuleExports() {
    if (!exportsPromise) {
      exportsPromise = loadGameComponent(mockRequire, {
        window: windowMock,
        ResizeObserver: ResizeObserverMock,
      });
    }

    return exportsPromise;
  }

  async function mountGame() {
    const { default: Game } = await getModuleExports();
    const mountedTree = await mountElement(jsx(Game, {}), root);
    await flushMicrotasks();
    await flushAnimationFrames();

    return {
      unmount() {
        mountedTree.unmount();
      },
    };
  }

  function setViewportSize(width, height) {
    root.setSize(width, height);
  }

  return {
    destroyCalls,
    gameInstances,
    scaleRefreshCalls,
    resizeObservers,
    root,
    getModuleExports,
    mountGame,
    setViewportSize,
    flushAnimationFrames,
    emitWindowEvent(type) {
      windowEvents.emit(type);
    },
    emitVisualViewportResize() {
      visualViewportEvents.emit("resize");
    },
    emitResizeObserver() {
      for (const observer of resizeObservers) {
        observer.trigger();
      }
    },
    emitMainSceneState(nextPatch) {
      mainSceneState = {
        ...mainSceneState,
        ...nextPatch,
      };

      for (const listener of [...mainSceneListeners]) {
        listener(mainSceneState);
      }
    },
    mainSceneListenerCount() {
      return mainSceneListeners.size;
    },
    getLastFocusedElement() {
      return MockElement.lastFocusedElement;
    },
    windowListenerCount(type) {
      return windowEvents.listenerCount(type);
    },
    visualViewportListenerCount(type) {
      return visualViewportEvents.listenerCount(type);
    },
    get resizeObserverDisconnects() {
      return resizeObserverDisconnects;
    },
  };
}

test("fitArenaToContainer snaps responsive dimensions to whole-grid cell sizes", async () => {
  const harness = createHarness();
  const { fitArenaToContainer } = await harness.getModuleExports();

  const landscapeFit = fitArenaToContainer(1000, 700, 960, 720, 40, 30);
  assert.equal(landscapeFit.width, 920);
  assert.equal(landscapeFit.height, 690);
  assert.equal(landscapeFit.scale, 920 / 960);

  const portraitFit = fitArenaToContainer(700, 1000, 960, 720, 40, 30);
  assert.equal(portraitFit.width, 680);
  assert.equal(portraitFit.height, 510);
  assert.equal(portraitFit.scale, 680 / 960);

  const zeroBoundsFit = fitArenaToContainer(0, 1000, 960, 720, 40, 30);
  assert.equal(zeroBoundsFit.width, 0);
  assert.equal(zeroBoundsFit.height, 0);
  assert.equal(zeroBoundsFit.scale, 0);
});

test("Game mount creates exactly one Phaser.Game instance and fits the arena size", async () => {
  const harness = createHarness();
  const mounted = await harness.mountGame();

  assert.equal(harness.gameInstances.length, 1);
  assert.ok(harness.scaleRefreshCalls.length >= 1, "expected initial scale refresh");

  const [instance] = harness.gameInstances;
  assert.ok(instance.config.parent, "Phaser game parent node should be provided");
  assert.equal(instance.config.parent.children.length, 1);
  assert.equal(instance.config.parent.children[0].tagName, "CANVAS");
  assert.equal(instance.config.parent.style.width, "920px");
  assert.equal(instance.config.parent.style.height, "690px");

  mounted.unmount();
});

test("Game resize pipeline refreshes Phaser scale and keeps arena dimensions grid-aligned", async () => {
  const harness = createHarness();
  const mounted = await harness.mountGame();
  const mountNode = harness.gameInstances[0].config.parent;

  assert.equal(harness.windowListenerCount("resize"), 1);
  assert.equal(harness.windowListenerCount("orientationchange"), 1);
  assert.equal(harness.visualViewportListenerCount("resize"), 1);
  assert.equal(harness.resizeObservers.length, 1);

  const initialRefreshCount = harness.scaleRefreshCalls.length;

  harness.setViewportSize(700, 1000);
  harness.emitWindowEvent("resize");
  await harness.flushAnimationFrames();

  assert.equal(mountNode.style.width, "680px");
  assert.equal(mountNode.style.height, "510px");
  assert.ok(
    harness.scaleRefreshCalls.length > initialRefreshCount,
    "expected a scale refresh after window resize",
  );

  const beforeVisualViewportRefresh = harness.scaleRefreshCalls.length;
  harness.emitVisualViewportResize();
  await harness.flushAnimationFrames();
  assert.ok(
    harness.scaleRefreshCalls.length > beforeVisualViewportRefresh,
    "expected a scale refresh after visual viewport resize",
  );

  const beforeObserverRefresh = harness.scaleRefreshCalls.length;
  harness.emitResizeObserver();
  await harness.flushAnimationFrames();
  assert.ok(
    harness.scaleRefreshCalls.length > beforeObserverRefresh,
    "expected a scale refresh after observer-triggered resize",
  );

  mounted.unmount();
});

test("Game focuses the arena frame when scene phase enters playing", async () => {
  const harness = createHarness();
  const mounted = await harness.mountGame();
  const frameNode = harness.root.children[0];

  assert.ok(frameNode, "expected frame node to be mounted");
  assert.equal(frameNode.tabIndex, -1);
  assert.equal(harness.mainSceneListenerCount(), 1);
  assert.equal(frameNode.focusCalls, 0);
  assert.equal(harness.getLastFocusedElement(), null);

  harness.emitMainSceneState({ phase: "game-over" });
  assert.equal(frameNode.focusCalls, 0);
  assert.equal(harness.getLastFocusedElement(), null);

  harness.emitMainSceneState({ phase: "playing" });
  assert.equal(frameNode.focusCalls, 1);
  assert.equal(harness.getLastFocusedElement(), frameNode);

  mounted.unmount();
  assert.equal(harness.mainSceneListenerCount(), 0);
});

test("Game unmount destroys Phaser and unregisters resize resources", async () => {
  const harness = createHarness();
  const mounted = await harness.mountGame();
  const mountNode = harness.gameInstances[0].config.parent;

  assert.equal(mountNode.children.length, 1);

  mounted.unmount();

  assert.deepEqual(harness.destroyCalls, [[true]]);
  assert.equal(mountNode.children.length, 0);
  assert.equal(harness.root.children.length, 0);
  assert.equal(harness.windowListenerCount("resize"), 0);
  assert.equal(harness.windowListenerCount("orientationchange"), 0);
  assert.equal(harness.visualViewportListenerCount("resize"), 0);
  assert.equal(harness.resizeObserverDisconnects, 1);
});
