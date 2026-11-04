import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const packageJson = JSON.parse(read("package.json"));

test("the manifest declares a DSH web client bundle and a patch", () => {
  assert.equal(packageJson.name, "dsh-plugin-custom-profile");
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.main, "./lib/index.js");
  assert.equal(packageJson.icon, "icon.svg");
  assert.equal(packageJson.exports["./client"], "./lib/client.js");
  assert.equal(packageJson.exports["./cordis.patch.yml"], "./cordis.patch.yml");
  assert.equal(packageJson.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(packageJson.dsh.client.platform, "web");
  assert.equal(packageJson.dsh.client.immediately, true);
});

test("the patch inserts the plugin under its registered id", () => {
  const patch = read("cordis.patch.yml");
  assert.match(patch, /^-\s+insert:\s*$/m);
  assert.match(patch, /id:\s*plugin-custom-profile/);
  assert.match(patch, /name:\s*dsh-plugin-custom-profile/);
});

test("the host half is inert and needs no services", async () => {
  const host = await import(new URL("lib/index.js", root));
  assert.equal(host.name, "plugin-custom-profile");
  assert.deepEqual(host.inject, []);
  assert.equal(typeof host.apply, "function");
  assert.doesNotThrow(() => host.apply({}));
});

test("locale files match the manifest titles", () => {
  const zh = JSON.parse(read("locale/zh.json"));
  const en = JSON.parse(read("locale/en.json"));
  assert.equal(zh.meta.title, packageJson.title.zh);
  assert.equal(en.meta.title, packageJson.title.en);
  for (const locale of [zh, en]) {
    assert.equal(typeof locale.meta.description, "string");
    assert.ok(locale.meta.description.length > 0);
  }
});

test("the client bundle is a loader factory that only requires react", () => {
  const source = read("lib/client.js");
  assert.match(source, /window\.__ModuleLoader__\.load\(/);
  assert.match(source, /id:\s*"dsh-plugin-custom-profile"/);
  assert.match(source, /factory:\s*(?:function\s*)?\(?\s*require\s*\)?\s*(?:=>|\{)/);
  const required = Array.from(source.matchAll(/require\("([^"]+)"\)/g), (match) => match[1]);
  assert.deepEqual(Array.from(new Set(required)), ["react"]);
});

test("the client makes no network calls and touches no host APIs", () => {
  const source = read("lib/client.js");
  for (const forbidden of [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\brequire\s*\(\s*["'](?:node:)?(?:fs|child_process|http|https|net)["']\s*\)/,
    /\belectron\b/i
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("the old plugin's keys are only read, never written", () => {
  const source = read("lib/client.js");
  assert.match(source, /LEGACY_ALIAS_KEY/);
  assert.doesNotMatch(source, /setItem\(\s*LEGACY_/);
  assert.doesNotMatch(source, /removeItem\(\s*LEGACY_/);
});

test("the package ships the files its exports name", () => {
  for (const path of [
    "lib/index.js",
    "lib/client.js",
    "cordis.patch.yml",
    "icon.svg",
    "locale/en.json",
    "locale/zh.json",
    "LICENSE",
    "README.md",
    "README.zh.md"
  ]) {
    assert.doesNotThrow(() => readFileSync(fileURLToPath(new URL(path, root))), `${path} is missing`);
  }
});
