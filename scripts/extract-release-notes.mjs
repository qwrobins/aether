#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2]?.replace(/^v/, "");
const outputPath = process.argv[3] ?? "release-notes.md";

if (!version) {
  throw new Error("Usage: node scripts/extract-release-notes.mjs <version> [output-path]");
}

const changelog = readFileSync("CHANGELOG.md", "utf8");
const heading = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\].*$`, "m");
const match = changelog.match(heading);

if (!match || match.index === undefined) {
  throw new Error(`Could not find CHANGELOG.md entry for ${version}`);
}

const start = match.index + match[0].length;
const rest = changelog.slice(start);
const nextHeading = rest.search(/^## \[/m);
const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();

if (!body) {
  throw new Error(`CHANGELOG.md entry for ${version} is empty`);
}

writeFileSync(outputPath, `${body}\n`);
