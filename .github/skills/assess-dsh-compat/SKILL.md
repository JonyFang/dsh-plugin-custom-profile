---
name: assess-dsh-compat
description: Decide whether lib/client.js still matches a given DeepSeek Harness client. Use after watch-dsh-release reports a newer version and before any edit. Does not edit the plugin or its version.
---

# Assess one DSH client

Input is the `latest` version from `watch-dsh-release`. Read that tag of `deepseek-ai/deepseek-harness` (`v<version>` or `dsh-v<version>`). Do not read an unrelated commit.

This plugin only depends on the signed-in account row and the settings section. Check these and nothing else:

- A launcher `button[aria-haspopup="menu"][data-signed-out]`. Signed in is the string `"false"`.
- The fallback `button[aria-haspopup="menu"][data-collapsed]` still exists.
- The label is a span whose class contains `_label` and whose only child is a text node.
- The avatar is a span whose class contains `_avatar`. A hashed prefix such as `hjANda_` changing does not count. The plugin matches the `_label` and `_avatar` fragments.
- `settings.section` is still a slot the client collects.
- `ctx.get("locale")` is still how a section reads the locale.

Write the result as:

- `needed: false` when every item above still holds. A copy change, a color token change, or a hashed class prefix change is not needed.
- `needed: true` only for an item that changed, and name the item and the new markup.
- `complete: false` when the tag or the account-row source cannot be found. Do not guess.

Do not edit the plugin. Do not bump a version. If `complete` is false, stop the whole task. A later skill must not record the version as verified.
