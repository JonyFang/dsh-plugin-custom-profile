---
name: watch-dsh-release
description: Detect whether the DeepSeek Harness page publishes a client version newer than dshCompat.verified. Use when checking for a DSH release. Does not edit the plugin.
---

# Watch the Harness page

Run:

```sh
node .github/skills/watch-dsh-release/scripts/latest.mjs
```

The script prints one JSON object:

- `verified` is `package.json` `dshCompat.verified`.
- `latest` is the newest client version it found.
- `changed` is true only when `latest` is newer than `verified`. An equal or older version is not a change. Do not downgrade.
- `pageMentionedVersion` is true when https://www.deepseek.com/en/harness/ contains an installer filename or a `deepseek-ai/deepseek-harness` release tag.
- `latest` is the newer of that page and the newest GitHub release. A date on the page is not a version. When the page names nothing, `source` is the GitHub release and `pageMentionedVersion` is false. Say which source won.

Stop when `changed` is false. Do not assess, adapt, or bump.

This skill does not edit files and does not open an issue. The workflow in `.github/workflows/watch-dsh.yml` does the scheduled half.
