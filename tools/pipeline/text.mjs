// Plain text of 5etools entries, and the content-addressed text cache (files <sha256>.txt).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INNERMOST_TAG = /\{@\w+\s*([^{}]*)\}/g;

// `{@tag text|more}` keeps `text`; applied until no tag is left so nested tags reduce from the inside out.
function stripTags(s) {
  let out = s;
  for (let prev = null; prev !== out; ) {
    prev = out;
    out = out.replace(INNERMOST_TAG, (_, args) => args.split("|")[0]);
  }
  return out;
}

function collect(node, parts) {
  if (node == null) return;
  if (typeof node === "string") parts.push(stripTags(node));
  else if (typeof node === "number") parts.push(String(node));
  else if (Array.isArray(node)) node.forEach((n) => collect(n, parts));
  else if (typeof node === "object") {
    if (node.name) parts.push(stripTags(String(node.name)));
    for (const key of ["entry", "entries", "items"]) collect(node[key], parts);
  }
}

export function plainText(entries) {
  const parts = [];
  collect(entries, parts);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export const textFingerprint = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const fileOf = (dir, sha) => join(dir, `${sha}.txt`);

export function cacheText(dir, text) {
  const sha = textFingerprint(text);
  if (!existsSync(fileOf(dir, sha))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(fileOf(dir, sha), text);
  }
  return sha;
}

export const hasText = (dir, sha) => existsSync(fileOf(dir, sha));
