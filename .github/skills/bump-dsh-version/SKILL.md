---
name: bump-dsh-version
description: Record a verified DeepSeek Harness client and set the package version to that client. Use after assess-dsh-compat completes, whether or not the plugin code changed. Do not use when the assessment did not finish.
---

# Record the verified client

Start only when `assess-dsh-compat` returned `complete: true`. Run it both when `needed` is false and after `adapt-custom-profile` has finished.

The package version tracks the DSH client it was checked against, not a separate plugin line.

- Set `package.json` `version` to the client version, with no `v` prefix. `0.2.2-rc.1` stays `0.2.2-rc.1`.
- Set `dshCompat.verified` to that same version.
- In `README.md`, change only the version inside the existing "Written against client" sentence.
- In `README.zh.md`, change only the version inside the existing "对照的客户端是" sentence.
- In `CLAUDE.md`, change only the version inside the existing "written against client" sentence. Leave the sentence that names the first release.
- Leave `engines.dsh` as it is when the plugin still runs on that floor. Raise it to `>=<client>` only when the assessment says the new code no longer runs on the old floor.
- A plugin-only fix on the same client is `<client>.1`, `<client>.2`, and so on. A newer client replaces that suffix. The version becomes the client version.

Do not rewrite the sentences. Do not put a real signed-in account into either README. Do not push the default branch, and do not push a git tag from the pull request branch. The tag `v` plus `version` is created on the default branch after the pull request merges, because the plugin market will not list a release whose tag does not match `version`. Pushing that tag publishes the GitHub Release and the npm package. The market index reads npm, so a tag that skips npm leaves the listing on the old version. Do not run `npm publish` from the pull request branch or from a local checkout; the release workflow publishes the version the tag names and skips publishing when npm already has that version. A tag that contains `-` is a prerelease. Do not create the release from the pull request branch. If an open pull request already records this client version, add the missing record to that branch. Do not open a second pull request.

Run `npm test` after the version edits. The package test checks that both READMEs and the `CLAUDE.md` sentence name `dshCompat.verified`, and that the release workflow publishes both the GitHub Release and the npm package.
