// Plain text of 5etools entries, and the content-addressed text cache (files <sha256>.txt).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INNERMOST_TAG = /\{@(\w+)\s*([^{}]*)\}/g;

const ABILITY = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const REACH = { m: "Melee", r: "Ranged" };
const ATTACK_KIND = { w: " Weapon Attack", s: " Spell Attack" };

// `{@atk mw}`, `{@atkr m,r}`: the attack header, by the letters of the argument.
function attackHeader(args, roll) {
  const letters = args.split("|")[0].split(",").map((l) => l.trim().toLowerCase()).filter(Boolean);
  const reach = [...new Set(letters.map((l) => REACH[l[0]]).filter(Boolean))];
  if (!reach.length) return null;
  const kinds = new Set(letters.map((l) => l[1]).filter(Boolean));
  const noun = roll ? " Attack Roll" : kinds.size === 1 ? ATTACK_KIND[[...kinds][0]] ?? " Attack" : " Attack";
  return `${reach.join(" or ")}${noun}:`;
}

const first = (args) => args.split("|")[0];

// Tags whose rendering carries words the reader needs; every other tag keeps its first argument.
export const TAG_RENDER = {
  atk: (a) => attackHeader(a, false),
  atkr: (a) => attackHeader(a, true),
  hit: (a) => { const n = first(a).trim(); return !n ? "" : /^[+-]/.test(n) ? n : `+${n}`; },
  h: () => "Hit:",
  m: () => "Miss:",
  dc: (a) => (first(a).trim() ? `DC ${first(a).trim()}` : ""),
  recharge: (a) => {
    const arg = first(a).trim();
    if (!arg) return "(Recharge 6)";
    const n = Number(arg);
    if (!Number.isInteger(n) || n < 2) return "(Recharge)";
    return n >= 6 ? "(Recharge 6)" : `(Recharge ${n}\u20136)`;
  },
  actSave: (a) => {
    const ability = ABILITY[first(a).trim().toLowerCase().slice(0, 3)];
    return ability ? `${ability} Saving Throw:` : null;
  },
  actSaveFail: (a) => { const n = first(a).trim(); return n ? `Failure by ${n} or More:` : "Failure:"; },
  actSaveFailBy: (a) => { const n = first(a).trim(); return n ? `Failure by ${n} or More:` : "Failure:"; },
  actSaveSuccess: () => "Success:",
  actSaveSuccessOrFail: () => "Failure or Success:",
  actTrigger: () => "Trigger:",
  actResponse: () => "Response:"
};

// `{@tag text|more}` keeps `text`, or its header from `table`; applied until no tag is left so nested tags reduce from the
// inside out.
function stripTagsWith(s, table) {
  let out = s;
  for (let prev = null; prev !== out; ) {
    prev = out;
    out = out.replace(INNERMOST_TAG, (_, tag, args) => (Object.hasOwn(table, tag) ? table[tag](args) : null) ?? args.split("|")[0]);
  }
  return out;
}

function collect(node, parts, strip) {
  if (node == null) return;
  if (typeof node === "string") parts.push(strip(node));
  else if (typeof node === "number") parts.push(String(node));
  else if (Array.isArray(node)) node.forEach((n) => collect(n, parts, strip));
  else if (typeof node === "object") {
    if (node.name) parts.push(strip(String(node.name)));
    for (const key of ["entry", "entries", "items"]) collect(node[key], parts, strip);
  }
}

function render(entries, strip) {
  const parts = [];
  collect(entries, parts, strip);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export const plainText = (entries) => render(entries, (s) => stripTagsWith(s, TAG_RENDER));

/** The renderer before attack headers were kept; only for comparing a stored fingerprint (Ruling R1). */
export const plainTextV1 = (entries) => render(entries, (s) => stripTagsWith(s, {}));

/** `{ text }`, plus `textV1` when the old renderer would have written other words (inventory compares fingerprints). */
export function textFields(entries) {
  const text = plainText(entries);
  const textV1 = plainTextV1(entries);
  return textV1 === text ? { text } : { text, textV1 };
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
/** The cached text of a fingerprint (the caller checked hasText). */
export const readText = (dir, sha) => readFileSync(fileOf(dir, sha), "utf8");
