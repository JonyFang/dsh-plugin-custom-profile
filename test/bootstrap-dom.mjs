// React DOM decides once, at module load, whether it can use DOM events. Load
// it only after a window exists; `makeWorld` replaces these globals per test.
import { JSDOM } from "jsdom";

const bootstrap = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://bootstrap.dsh.test/",
  pretendToBeVisual: true
});

globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
