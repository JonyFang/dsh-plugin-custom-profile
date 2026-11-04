---
name: adapt-custom-profile
description: Update the sidebar name and avatar override when assess-dsh-compat says the account row or settings section changed. Use only then. Does not change the package version.
---

# Adapt the plugin

Start only when `assess-dsh-compat` returned `complete: true` and `needed: true`. Change only the items that assessment named.

Keep these constraints:

- Display-only. Do not write account data, do not add network calls, and do not write host files.
- Do not rename or print `STORAGE_KEY`. Do not write `LEGACY_ALIAS_KEY` or `LEGACY_AVATAR_KEY`.
- Paint through the existing label text node and the avatar background. Do not remove React nodes.
- If the new markup does not match, stop painting. Do not throw.
- Dispose still restores the shipped name and avatar, including when that name equals the custom name.
- Settings copy stays in the `TEXT` object. `locale/en.json` and `locale/zh.json` stay plugin-list metadata.
- The host entry `lib/index.js` stays empty. The only `require` in `lib/client.js` stays `"react"`.

Update the tests in `test/` for the markup you changed. Run `npm test`. Do not change `package.json` `version`, `dshCompat.verified`, `engines.dsh`, or the README client line. `bump-dsh-version` does that.
