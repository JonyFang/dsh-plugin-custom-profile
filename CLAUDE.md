# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node `^22.19.0 || >=24.0.0`. There is no build and no lint. `lib/client.js` is served as-is.

```sh
npm test
node --test test/display.test.mjs
node --test --test-name-pattern "names are normalized" test/display.test.mjs
```

`npm test` runs `test/display.test.mjs`, `test/settings.test.mjs`, and `test/package.test.mjs` with the Node test runner. Tests use jsdom and React 18. The harness in `test/harness.mjs` loads `lib/client.js` through `window.__ModuleLoader__` and flushes a stubbed `requestAnimationFrame` with `world.flushFrames`.

Install into a DSH profile with `dsh plugin --profile desktop add <absolute-path>`, or symlink this directory into the profile's `node_modules` and append `cordis.patch.yml`. Restart if **Profile** does not appear. Nothing is compiled.

## Architecture

Display-only. It replaces the signed-in account row at the bottom left of the macOS DSH client. It does not change account data, make network requests, or write host files. Disabling or uninstalling removes the override.

Two halves, and only the browser half does anything:

- `lib/index.js` is the host entry. `name` is `plugin-custom-profile`, `inject` is `[]`, `apply` is empty. It exists so the loader can mount the package and the host can read `dsh.client` from `package.json`.
- `lib/client.js` is the browser bundle: `window.__ModuleLoader__.load`, and the only `require` is `"react"`. Its module id is the package name `dsh-plugin-custom-profile`. `apply(ctx)` injects a `settings.section` (id `plugin-custom-profile`, order 5) and mounts the DOM override. `ctx.effect` disposes both.

`package.json` `name`, the host `name`, the patch `id` in `cordis.patch.yml`, and `PLUGIN_ID` must stay `plugin-custom-profile` / `dsh-plugin-custom-profile` as they are now. `dsh.client.platform` is `web` and `dsh.client.immediately` is true. UI copy for the settings page lives in the `TEXT` object inside `lib/client.js`. `locale/en.json` and `locale/zh.json` are only the plugin-list title and description (`个人资料` / `Profile` in the nav; `自定义头像/昵称` / `Custom Profile` in the list).

One `localStorage` record, `{ v: 1, name, avatar }`, written atomically. A `storage` event keeps other frames in sync. An empty name and empty avatar removes the record. Do not rename or print `STORAGE_KEY`; changing it orphans saved names and avatars, and the harness reads the literal from source. `LEGACY_ALIAS_KEY` and `LEGACY_AVATAR_KEY` are a read-only presence check that shows a warning. Never write or import those values.

The account launcher (`@deepseek-ai/dsh-client-ui-settings-account`) has no extension slot. The adapter finds `button[aria-haspopup="menu"][data-signed-out]`, with a `data-collapsed` fallback, and only paints when signed in (`data-signed-out="false"`). It writes the existing label text node and sets the avatar's `background-image`. It does not remove React nodes. A collapsed rail gets the avatar only. Markers are `data-dsh-plugin-custom-profile-label|avatar|style`. Settings CSS classes stay `dsh-pp-*`. If the markup does not match (written against client `0.2.1-rc.5`), painting stops; it must not throw. Dispose restores the shipped name and avatar, including the case where the account name equals the custom name (`labelShipped` comes from the mutation record, not a text compare).

Names are capped at 32 code points. `sanitizeName` strips C0/C1 controls and bidi/zero-width characters, then collapses whitespace. ZWJ (`U+200D`) and ZWNJ (`U+200C`) stay so emoji sequences survive. Avatars: PNG, JPG, WebP, GIF, or AVIF, at most 10 MB and 40 megapixels, center-cropped to 128×128, stored as WebP quality 0.9 or PNG. A GIF is one frame.

`subscribeLocale` retries for about 2 seconds (120 frames) if the locale service is missing when Profile first mounts. An English id starts with `en`; anything else uses Chinese.

## What ships

`package.json` `files` is a whitelist and overrides `.gitignore`. It includes `docs/` and the two architecture GIFs, not the rest of `.archify/` and not `design/`. Do not add `.archify` as a directory. `.gitignore` keeps `candidate.json`, `candidate.en.json`, and `*.gif` under `.archify/`; everything else generated there stays out. `design/profile-settings.html` is a static preview of the saved settings page (sample names Jony / 强尼, avatar from `icon.svg`). README effect shots are `docs/use-en.png` and `docs/use-zh.png`. Do not put a real signed-in account into either.
