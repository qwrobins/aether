#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const repo = process.env.GITHUB_REPOSITORY ?? git(["config", "--get", "remote.origin.url"]).replace(/^.*github.com[:/]/, "").replace(/\.git$/, "");
const token = process.env.GITHUB_TOKEN;

function git(command) {
  return execFileSync("git", command, { encoding: "utf8" }).trim();
}

function gh(command) {
  return execFileSync("gh", command, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token ?? process.env.GH_TOKEN ?? "" },
  }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
  if (!match) {
    throw new Error(`Unsupported semantic version: ${version}`);
  }
  return match.slice(1).map(Number);
}

function normalizeVersion(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch}`;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return 0;
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version);
  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function latestVersionTag() {
  const tags = git(["tag", "--list", "v[0-9]*.[0-9]*.[0-9]*", "--sort=-version:refname"])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags[0] ?? "";
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const output = git(["log", "--format=%H%x1f%s%x1f%b%x1e", range]);
  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body = ""] = entry.split("\x1f");
      return { sha, subject, body };
    })
    .filter((commit) => !commit.subject.startsWith("chore(release):"));
}

function conventionalType(commit) {
  const match = commit.subject.match(/^(\w+)(?:\([^)]+\))?(!)?:\s+(.+)$/);
  if (!match) {
    return { type: "misc", title: commit.subject, breaking: /BREAKING CHANGE:/i.test(commit.body) };
  }
  return {
    type: match[1],
    title: match[3],
    breaking: Boolean(match[2]) || /BREAKING CHANGE:/i.test(commit.body),
  };
}

function releaseBump(commits) {
  let bump = null;
  for (const commit of commits) {
    const parsed = conventionalType(commit);
    if (parsed.breaking) {
      return "major";
    }
    if (parsed.type === "feat") {
      bump = bump === "major" ? bump : "minor";
    }
    if (["fix", "perf", "security", "revert"].includes(parsed.type) && bump !== "minor") {
      bump = "patch";
    }
  }
  return bump;
}

function sectionFor(type) {
  if (type === "feat") return "Features";
  if (["fix", "revert"].includes(type)) return "Bug Fixes";
  if (type === "perf") return "Performance";
  if (type === "security") return "Security";
  if (["ci", "build"].includes(type)) return "Automation";
  return "Miscellaneous";
}

function linkedIssueRefs(text) {
  return Array.from(text.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g), ([match]) => match);
}

function cleanBody(body) {
  return body
    .replace(/<!-- This is an auto-generated comment: release notes by coderabbit\.ai -->[\s\S]*?<!-- end of auto-generated comment: release notes by coderabbit\.ai -->/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("<!--") && !line.startsWith(">"))
    .filter((line) => !/^#+\s*(checklist|testing|screenshots?)\b/i.test(line))
    .filter((line) => !/^\[[ x]\]/i.test(line) && !/^- \[[ x]\]/i.test(line))
    .slice(0, 6);
}

function summaryLines(body) {
  const withoutGenerated = body.replace(
    /<!-- This is an auto-generated comment: release notes by coderabbit\.ai -->[\s\S]*?<!-- end of auto-generated comment: release notes by coderabbit\.ai -->/g,
    "",
  );
  const summaryMatch = withoutGenerated.match(/^##\s+Summary\s*$/im);
  if (!summaryMatch || summaryMatch.index === undefined) {
    return cleanBody(withoutGenerated);
  }

  const start = summaryMatch.index + summaryMatch[0].length;
  const rest = withoutGenerated.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  return cleanBody(nextHeading === -1 ? rest : rest.slice(0, nextHeading));
}

function localPrNumber(commit) {
  const match = `${commit.subject}\n${commit.body}`.match(/\(#(\d+)\)|Pull Request resolved:\s*#(\d+)|Merge pull request #(\d+)/i);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function githubPrForCommit(commit) {
  if (!token || !repo || dryRun) {
    return null;
  }

  try {
    const output = gh([
      "api",
      `repos/${repo}/commits/${commit.sha}/pulls`,
      "--header",
      "Accept: application/vnd.github+json",
      "--jq",
      ".[0] // empty",
    ]);
    return output ? JSON.parse(output) : null;
  } catch {
    return null;
  }
}

function releaseNoteTitle(title) {
  return title.replace(/^\[codex\]\s+/i, "");
}

function releaseNoteSection(title, parsed) {
  const normalizedTitle = releaseNoteTitle(title);
  if (/\b(?:release|tag|workflow|automation)\b/i.test(normalizedTitle)) {
    return "Automation";
  }
  if (/^fix\b/i.test(normalizedTitle)) {
    return "Bug Fixes";
  }
  return sectionFor(parsed.type);
}

function isReleaseMetadataPr(pr) {
  return Boolean(
    pr &&
      (/^chore\(main\): release\b/i.test(pr.title ?? "") ||
        /This PR was generated with \[Release Please\]/i.test(pr.body ?? "")),
  );
}

function changelogEntry(version, previousTag, commits) {
  const today = new Date().toISOString().slice(0, 10);
  const compareBase = previousTag || git(["rev-list", "--max-parents=0", "HEAD"]);
  const compareUrl = `https://github.com/${repo}/compare/${compareBase}...v${version}`;
  const lines = [`## [${version}](${compareUrl}) (${today})`, ""];
  const sections = new Map();
  const seen = new Set();

  for (const commit of commits) {
    const pr = githubPrForCommit(commit);
    if (isReleaseMetadataPr(pr)) {
      continue;
    }
    const commitParsed = conventionalType(commit);
    const title = pr?.title ?? commitParsed.title;
    const parsed = pr
      ? conventionalType({ subject: releaseNoteTitle(title), body: pr.body ?? commit.body })
      : commitParsed;
    if (!pr && parsed.type === "chore") {
      continue;
    }
    const section = releaseNoteSection(title, parsed);
    const prNumber = pr?.number ?? localPrNumber(commit);
    const key = prNumber ? `pr:${prNumber}` : `commit:${commit.sha}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const url = pr?.html_url ?? (prNumber ? `https://github.com/${repo}/pull/${prNumber}` : `https://github.com/${repo}/commit/${commit.sha}`);
    const refs = Array.from(new Set([...linkedIssueRefs(commit.subject), ...linkedIssueRefs(commit.body), ...linkedIssueRefs(pr?.body ?? "")]));
    const detailLines = summaryLines(pr?.body ?? commit.body);
    const item = [
      `* ${releaseNoteTitle(title)} ([${prNumber ? `#${prNumber}` : commit.sha.slice(0, 7)}](${url}))${refs.length ? ` - ${refs.join(", ")}` : ""}`,
      ...detailLines.map((line) => `  * ${line.replace(/^-+\s*/, "")}`),
    ];

    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section).push(item.join("\n"));
  }

  for (const [section, entries] of sections) {
    lines.push(`### ${section}`, "", ...entries, "");
  }

  return lines.join("\n").trimEnd();
}

function writeChangelogEntry(version, previousTag, commits) {
  const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "# Changelog\n";
  const entry = changelogEntry(version, previousTag, commits);
  const heading = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\].*$`, "m");
  const match = changelog.match(heading);

  if (!match || match.index === undefined) {
    return changelog.replace(/^# Changelog\s*/, `# Changelog\n\n${entry}\n\n`);
  }

  const start = match.index;
  const rest = changelog.slice(start + match[0].length);
  const nextHeading = rest.search(/^## \[/m);
  const end = nextHeading === -1 ? changelog.length : start + match[0].length + nextHeading;
  return `${changelog.slice(0, start)}${entry}\n\n${changelog.slice(end).replace(/^\s+/, "")}`;
}

function updatePackageLock(version) {
  const lock = readJson("package-lock.json");
  lock.version = version;
  if (lock.packages?.[""]) {
    lock.packages[""].version = version;
  }
  writeJson("package-lock.json", lock);
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: "a" });
  }
  console.log(`${name}=${value}`);
}

function hasPreparedReleaseMetadata(version) {
  if (!existsSync(".release-please-manifest.json") || !existsSync("CHANGELOG.md")) {
    return false;
  }

  const manifest = readJson(".release-please-manifest.json");
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  return manifest["."] === version && changelog.includes(`## [${version}]`);
}

const currentPackage = readJson("package.json");
const previousTag = latestVersionTag();
const packageVersion = normalizeVersion(currentPackage.version);
const baseVersion = previousTag ? normalizeVersion(previousTag) : packageVersion;

if (previousTag && packageVersion !== baseVersion) {
  if (compareVersions(packageVersion, baseVersion) > 0 && hasPreparedReleaseMetadata(packageVersion)) {
    const commits = commitsSince(previousTag);
    if (!dryRun) {
      writeFileSync("CHANGELOG.md", writeChangelogEntry(packageVersion, previousTag, commits));
    }
    setOutput("released", "true");
    setOutput("version", packageVersion);
    setOutput("tag", `v${packageVersion}`);
    console.log(
      `Release metadata for v${packageVersion} is already prepared; ` +
        `latest tag is still ${previousTag}, so only the missing tag will be created.`,
    );
    process.exit(0);
  }

  throw new Error(
    `package.json version ${currentPackage.version} does not match latest release tag ${previousTag}. ` +
      "Sync package.json with the latest tag before preparing the next release.",
  );
}

const commits = commitsSince(previousTag);
const bump = releaseBump(commits);

if (!bump) {
  setOutput("released", "false");
  console.log("No releasable conventional commits found.");
  process.exit(0);
}

const nextVersion = bumpVersion(baseVersion, bump);
const nextTag = `v${nextVersion}`;

if (existsSync(".release-please-manifest.json")) {
  const manifest = readJson(".release-please-manifest.json");
  manifest["."] = nextVersion;
  if (!dryRun) writeJson(".release-please-manifest.json", manifest);
}

currentPackage.version = nextVersion;
if (!dryRun) {
  writeJson("package.json", currentPackage);
  updatePackageLock(nextVersion);
}

const nextChangelog = writeChangelogEntry(nextVersion, previousTag, commits);
if (!dryRun) {
  writeFileSync("CHANGELOG.md", nextChangelog);
}

setOutput("released", "true");
setOutput("version", nextVersion);
setOutput("tag", nextTag);
console.log(`${dryRun ? "Would prepare" : "Prepared"} ${nextTag} from ${previousTag || "initial commit"} using a ${bump} bump.`);
