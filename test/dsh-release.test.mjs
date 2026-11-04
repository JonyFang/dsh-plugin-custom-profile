import test from "node:test";
import assert from "node:assert/strict";
import {
  compareVersions,
  reportFrom,
  versionsFromPage,
  versionsFromTags
} from "../.github/skills/watch-dsh-release/scripts/latest.mjs";

test("release order follows semver, including prerelease tags", () => {
  assert.equal(compareVersions("0.2.2-rc.1", "0.2.1-rc.5"), 1);
  assert.equal(compareVersions("0.2.1-rc.5", "0.2.1-rc.5"), 0);
  assert.equal(compareVersions("0.2.2", "0.2.2-rc.1"), 1);
  assert.equal(compareVersions("v0.2.2-rc.1", "dsh-v0.2.2-rc.1"), 0);
  assert.equal(compareVersions("0.2.1-rc.5", "0.2.1-rc.5.1"), -1);
});

test("the harness page only counts installer names and official release tags", () => {
  const page = [
    "Updated October 19, 2026.",
    "href=\"https://download.deepseek.com/dsh-desk/bin/mac/deepseek-harness-0.2.2-rc.1-mac.dmg\"",
    "https://github.com/deepseek-ai/deepseek-harness/releases/tag/v0.2.1-rc.5"
  ].join("\n");
  assert.deepEqual(versionsFromPage(page).sort(), ["0.2.1-rc.5", "0.2.2-rc.1"]);
});

test("a date on the page is not a client version", () => {
  assert.deepEqual(versionsFromPage("Checked 2026.11.04. No download yet."), []);
});

test("a page with no version falls back to the newest GitHub release", () => {
  const report = reportFrom({
    verified: "0.2.1-rc.5",
    pageText: "<html>DeepSeek Harness is in public preview.</html>",
    releaseTags: ["v0.2.1-rc.5", "dsh-v0.2.2-rc.1"]
  });
  assert.equal(report.latest, "0.2.2-rc.1");
  assert.equal(report.changed, true);
  assert.equal(report.pageMentionedVersion, false);
  assert.equal(report.source, "https://github.com/deepseek-ai/deepseek-harness/releases/tag/v0.2.2-rc.1");
});

test("a newer GitHub release wins when the page is behind", () => {
  const report = reportFrom({
    verified: "0.2.1-rc.5",
    pageText: "deepseek-harness-0.2.1-rc.5",
    releaseTags: ["v0.2.2-rc.1"]
  });
  assert.equal(report.latest, "0.2.2-rc.1");
  assert.equal(report.changed, true);
  assert.equal(report.pageMentionedVersion, true);
  assert.match(report.source, /releases\/tag\/v0\.2\.2-rc\.1$/);
});

test("an older release does not count as a change", () => {
  const report = reportFrom({
    verified: "0.2.2-rc.1",
    pageText: "deepseek-harness-0.2.1-rc.5",
    releaseTags: ["v0.2.1-rc.5"]
  });
  assert.equal(report.changed, false);
  assert.equal(report.latest, "0.2.1-rc.5");
});

test("GitHub tags keep their prerelease suffix", () => {
  assert.deepEqual(versionsFromTags(["dsh-v0.2.2-rc.1", "not-a-version"]), ["0.2.2-rc.1"]);
});
