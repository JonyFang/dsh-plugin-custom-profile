/**
 * Detect a DeepSeek Harness client newer than the one this plugin has recorded.
 *
 * The page https://www.deepseek.com/en/harness/ is fetched first. A version
 * counts only when it is an installer filename or a deepseek-ai/deepseek-harness
 * release tag on that page. Bare dates are ignored. If the page names none,
 * the newest GitHub release tag is the fallback, and the report says so.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PAGE = "https://www.deepseek.com/en/harness/";
export const RELEASES = "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=20";

const VERSION = /(?:dsh-)?v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?/;

export function parseVersion(input) {
  const match = String(input).trim().match(new RegExp(`^${VERSION.source}$`));
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] === undefined ? null : match[4].split(".")
  };
}

function compareId(left, right) {
  const leftNumber = /^\d+$/.test(left);
  const rightNumber = /^\d+$/.test(right);
  if (leftNumber && rightNumber) return Math.sign(Number(left) - Number(right));
  if (leftNumber) return -1;
  if (rightNumber) return 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Semver compare. Accepts an optional `v` or `dsh-v` prefix. */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === null || b === null) {
    throw new Error(`not a version: ${a === null ? left : right}`);
  }
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.pre === null && b.pre === null) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  const length = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < length; i++) {
    if (a.pre[i] === undefined) return -1;
    if (b.pre[i] === undefined) return 1;
    const order = compareId(a.pre[i], b.pre[i]);
    if (order !== 0) return order;
  }
  return 0;
}

export function pickLatest(versions) {
  const parsed = versions.filter((version) => parseVersion(version) !== null);
  if (parsed.length === 0) return null;
  return parsed.reduce((best, version) => (compareVersions(version, best) > 0 ? version : best));
}

function normalize(raw) {
  const match = String(raw).trim().match(new RegExp(`^${VERSION.source}$`));
  if (match === null) return null;
  return match[4] === undefined
    ? `${match[1]}.${match[2]}.${match[3]}`
    : `${match[1]}.${match[2]}.${match[3]}-${match[4]}`;
}

/** Installer filenames and official release tags only. */
export function versionsFromPage(text) {
  const found = new Set();
  const patterns = [
    /deepseek-harness-((?:dsh-)?v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/g,
    /deepseek-ai\/deepseek-harness\/releases\/tag\/((?:dsh-)?v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/g
  ];
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) {
      const version = normalize(match[1]);
      if (version !== null) found.add(version);
    }
  }
  return [...found];
}

export function versionsFromTags(tags) {
  const found = [];
  for (const tag of tags) {
    const version = normalize(tag);
    if (version !== null) found.push(version);
  }
  return found;
}

export function reportFrom({ verified, pageText, releaseTags }) {
  const pageLatest = pickLatest(versionsFromPage(pageText));
  const releaseLatest = pickLatest(versionsFromTags(releaseTags));
  const latest = pickLatest([pageLatest, releaseLatest].filter((version) => version !== null));
  const source = latest === null
    ? null
    : latest === pageLatest
      ? PAGE
      : `https://github.com/deepseek-ai/deepseek-harness/releases/tag/v${latest}`;
  return {
    verified,
    latest,
    changed: latest !== null && compareVersions(latest, verified) > 0,
    source,
    page: PAGE,
    pageMentionedVersion: pageLatest !== null,
    release: releaseLatest
  };
}

async function readText(url) {
  const response = await fetch(url, {
    headers: {
      accept: url.startsWith("https://api.github.com/") ? "application/vnd.github+json" : "text/html",
      "user-agent": "dsh-plugin-custom-profile-watch"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function main() {
  const packageJson = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));
  const verified = packageJson.dshCompat && packageJson.dshCompat.verified;
  if (parseVersion(verified) === null) {
    throw new Error("package.json dshCompat.verified is missing or not a version");
  }
  const pageText = await readText(PAGE);
  const releases = JSON.parse(await readText(RELEASES));
  const releaseTags = Array.isArray(releases)
    ? releases.filter((release) => release.draft !== true).map((release) => release.tag_name)
    : [];
  process.stdout.write(`${JSON.stringify(reportFrom({ verified, pageText, releaseTags }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
