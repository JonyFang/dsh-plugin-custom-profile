import "./bootstrap-dom.mjs";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom/client";

const act = React.act;

const CLIENT_SOURCE = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const KEY_MATCH = CLIENT_SOURCE.match(/var STORAGE_KEY = "([^"]+)";/);
if (KEY_MATCH === null) throw new Error("client bundle has no STORAGE_KEY");
export const STORAGE_KEY = KEY_MATCH[1];
export const LEGACY_ALIAS_KEY = "dsh.account-display-name-edit.alias";
export const LEGACY_AVATAR_KEY = "dsh.account-display-name-edit.avatar";
export const PNG = "data:image/png;base64,QUJD";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export { act };

export function launcherHtml(options = {}) {
  const signedOut = options.signedOut === true;
  const collapsed = options.collapsed === true;
  const label = options.label || (signedOut ? "更多" : "181******40");
  const avatar = signedOut
    ? '<svg class="ellipsis"></svg>'
    : '<span class="abc_avatar" data-avatar-status="ready"><img class="abc_image" src="native.png" alt=""></span>';
  const labelSpan = collapsed ? "" : `<span class="abc_label">${label}</span>`;
  return (
    '<div class="abc_root"><button type="button" aria-haspopup="menu" ' +
    `data-signed-out="${signedOut ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}">` +
    avatar +
    labelSpan +
    "</button></div>"
  );
}

export function makeWorld(options = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${options.body === undefined ? launcherHtml() : options.body}</body></html>`,
    { url: "https://dsh.test/", runScripts: "dangerously", pretendToBeVisual: true }
  );
  const { window } = dom;

  globalThis.window = window;
  globalThis.document = window.document;

  let nextFrame = 1;
  const frames = new Map();
  window.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };

  const listeners = new Set();
  let localeId = options.locale || "zh";
  let revision = 0;
  let localeSnapshot = Object.freeze({ active: localeId, locales: [], revision: revision });
  const localeService = {
    getLocale: () => localeSnapshot,
    getSnapshot: () => localeSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (id) => {
      localeId = id;
      revision += 1;
      localeSnapshot = Object.freeze({ active: id, locales: [], revision: revision });
      listeners.forEach((listener) => listener());
    }
  };

  const store = window.localStorage;
  if (options.raw !== undefined) store.setItem(STORAGE_KEY, options.raw);
  else if (options.record !== undefined && options.record !== null) {
    store.setItem(STORAGE_KEY, JSON.stringify(options.record));
  }
  if (options.legacy === true) {
    store.setItem(LEGACY_ALIAS_KEY, "Old name");
    store.setItem(LEGACY_AVATAR_KEY, PNG);
  }

  let captured = null;
  window.__ModuleLoader__ = {
    load(entry) {
      captured = entry;
    }
  };
  window.eval(CLIENT_SOURCE);
  if (captured === null) throw new Error("client bundle did not call __ModuleLoader__.load");

  const module = captured.factory((name) => {
    if (name === "react") return React;
    throw new Error("unexpected require: " + name);
  });

  let localeAvailable = options.lateLocale !== true;
  const slots = [];
  const effects = [];
  const ctx = {
    get(name) {
      if (name === "locale") return localeAvailable ? localeService : undefined;
      return undefined;
    },
    logger: { warn() {} },
    slots: {
      inject(slotName, callback) {
        const dispose = callback();
        return typeof dispose === "function" ? dispose : () => {};
      },
      register(options, component) {
        const entry = { options, component };
        slots.push(entry);
        return () => {
          const index = slots.indexOf(entry);
          if (index >= 0) slots.splice(index, 1);
        };
      }
    },
    effect(fn) {
      const dispose = fn();
      effects.push(dispose);
      return dispose;
    }
  };

  module.apply(ctx);

  async function microtasks() {
    await Promise.resolve();
    await Promise.resolve();
  }

  async function flushFrames(count = 1) {
    for (let i = 0; i < count; i++) {
      const pending = Array.from(frames.values());
      frames.clear();
      pending.forEach((callback) => callback(16 * (i + 1)));
      await Promise.resolve();
    }
    await microtasks();
  }

  async function settle() {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await microtasks();
    await flushFrames(2);
  }

  function disposeAll() {
    effects.forEach((dispose) => {
      if (typeof dispose === "function") dispose();
    });
  }

  function dispatchStorage(key = STORAGE_KEY) {
    window.dispatchEvent(new window.StorageEvent("storage", { key, newValue: store.getItem(key) }));
  }

  function enableLocale() {
    localeAvailable = true;
  }

  return {
    dom,
    window,
    document: window.document,
    module,
    ctx,
    slots,
    effects,
    localeService,
    frames,
    storage: store,
    microtasks,
    flushFrames,
    settle,
    disposeAll,
    dispatchStorage,
    enableLocale
  };
}

export function storedRecord(world) {
  const raw = world.storage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

export function findSlot(world, name = "settings.section") {
  return world.slots.find((entry) => entry.options.name === name) || null;
}

export async function renderSection(world) {
  const entry = findSlot(world);
  if (entry === null) throw new Error("settings.section was not registered");
  const container = world.document.createElement("div");
  world.document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(React.createElement(entry.component));
  });
  return { root, container };
}

export async function click(world, element) {
  if (!element) throw new Error("click target missing");
  await act(async () => {
    element.dispatchEvent(new world.window.MouseEvent("click", { bubbles: true }));
  });
}

export async function typeInto(world, input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    world.window.HTMLInputElement.prototype,
    "value"
  ).set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new world.window.Event("input", { bubbles: true }));
  });
}

export function buttonByText(container, text) {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === text
    ) || null
  );
}

export function stubImagePipeline(world, options = {}) {
  const draws = [];
  let encoded = options.encoded || "data:image/webp;base64,QUJD";
  const width = options.width || 800;
  const height = options.height || 600;

  class FakeImage {
    constructor() {
      this.naturalWidth = width;
      this.naturalHeight = height;
      this.width = width;
      this.height = height;
    }
    set src(value) {
      this._src = value;
      world.window.setTimeout(() => {
        if (options.fail === true) {
          if (typeof this.onerror === "function") this.onerror();
        } else if (typeof this.onload === "function") {
          this.onload();
        }
      }, options.delay || 0);
    }
    get src() {
      return this._src;
    }
  }

  world.window.Image = FakeImage;
  world.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage(...args) {
        draws.push(args);
      },
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low"
    };
  };
  world.window.HTMLCanvasElement.prototype.toDataURL = function (type) {
    if (typeof options.encode === "function") return options.encode(type);
    return encoded;
  };

  return {
    draws,
    setEncoded(value) {
      encoded = value;
    }
  };
}

export async function chooseFile(world, container, file) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file]
  });
  await act(async () => {
    input.dispatchEvent(new world.window.Event("change", { bubbles: true }));
    await new Promise((resolve) => world.window.setTimeout(resolve, 30));
  });
}
