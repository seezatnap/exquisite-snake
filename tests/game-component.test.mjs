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
    this._forceConnected = forceConnected;
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
}

async function loadGameComponent(mockRequire) {
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
  });

  vm.runInContext(transpiled.outputText, context, { filename: "Game.cjs" });
  return compiledModule.exports.default;
}

function createHarness() {
  const root = new MockElement("root", true);
  const destroyCalls = [];
  const gameInstances = [];
  let currentInstance = null;

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
      return { GAME_CONFIG: { width: 640, height: 640 } };
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

      if (typeof props.className === "string") {
        domNode.className = props.className;
      }

      if (props.ref && typeof props.ref === "object") {
        props.ref.current = domNode;
      }

      parentNode.appendChild(domNode);

      return {
        node: domNode,
        unmount() {
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

  async function mountGame() {
    const Game = await loadGameComponent(mockRequire);
    const mountedTree = await mountElement(jsx(Game, {}), root);
    await flushMicrotasks();

    return {
      unmount() {
        mountedTree.unmount();
      },
    };
  }

  return {
    destroyCalls,
    gameInstances,
    root,
    mountGame,
  };
}

test("Game mount creates exactly one Phaser.Game instance", async () => {
  const harness = createHarness();
  const mounted = await harness.mountGame();

  assert.equal(harness.gameInstances.length, 1);

  const [instance] = harness.gameInstances;
  assert.ok(instance.config.parent, "Phaser game parent node should be provided");
  assert.equal(instance.config.parent.children.length, 1);
  assert.equal(instance.config.parent.children[0].tagName, "CANVAS");

  mounted.unmount();
});

test("Game unmount destroys Phaser and clears mount DOM node", async () => {
  const harness = createHarness();
  const mounted = await harness.mountGame();
  const mountNode = harness.gameInstances[0].config.parent;

  assert.equal(mountNode.children.length, 1);

  mounted.unmount();

  assert.deepEqual(harness.destroyCalls, [[true]]);
  assert.equal(mountNode.children.length, 0);
  assert.equal(harness.root.children.length, 0);
});
