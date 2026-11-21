// Monsters, feature by feature: a creature has no single rule, the engine plays its stat-block features one by one, so each
// trait, action, bonus action, reaction, legendary action and mythic action is an entry of its own (kind "monster").
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { plainText } from "./text.mjs";
import { editionOf } from "./edition.mjs";
import { KIND_TABLE } from "./kinds.mjs";
import { slug } from "./registry.mjs";
import { matchName } from "./match.mjs";

// The sections of a stat block, in the order they are listed. A spellcasting block is read as one more trait.
export const SECTIONS = Object.freeze(["trait", "action", "bonus", "reaction", "legendary", "mythic"]);

const RECHARGE_TAG = /\{@recharge[^}]*\}/gi;
// The qualifier the first keys were derived with: a parenthesised group that starts with a cost, a recharge or "at will", or
// that holds a count per day, rest, turn, short or long rest. Kept as it was for the keys only (keyFeatureName).
const KEY_QUALIFIER = /\s*\((?:costs?\b|recharges?\b|at will\b|[^()]*\d\s*\/\s*(?:day|rest|turn|short|long))[^()]*\)/gi;
// A trailing parenthesised group that says anywhere in it how a feature is paid for or limited: (Costs 2 Actions), (2/Day),
// (6/Year), (Recharge 5–6), (Celestial Only; Recharges after a Long Rest), (At Will), (3 Uses). Any other group ("(Beast Form
// Only)") belongs to the name.
const LIMIT = /\b(?:costs?|recharges?|at will|uses?|per (?:day|turn|round|rest))\b|\d\s*\/\s*[a-z]/i;
const TRAILING_GROUP = /\s*\(([^()]*)\)\s*$/;

const clean = (name) => plainText(name).replace(/\s+/g, " ").trim();

/**
 * The name a feature's KEY is derived from: the rule the first registry records were written with, frozen so that no
 * committed key changes (a key never changes). Use baseFeatureName for everything else.
 */
export function keyFeatureName(name) {
  return clean(String(name ?? "").replace(RECHARGE_TAG, " ").replace(KEY_QUALIFIER, " "));
}

/** The name of a feature without the recharge markup and the cost, use or limit qualifiers; those are in its text. */
export function baseFeatureName(name) {
  let rest = keyFeatureName(name);
  for (let group = rest.match(TRAILING_GROUP); group && LIMIT.test(group[1]); group = rest.match(TRAILING_GROUP)) {
    rest = rest.slice(0, group.index).trim();
  }
  return rest || keyFeatureName(name);
}

// The strings a spellcasting block is made of: its header and footer, the spells it lists and its ability.
function spellcastingText(block) {
  const spells = Object.values(block.spells ?? {}).flatMap((level) => level?.spells ?? []);
  const daily = Object.values(block.daily ?? {}).flat();
  const rest = Object.values(block.rest ?? {}).flat();
  return plainText([block.headerEntries, block.will, daily, rest, spells, block.footerEntries]);
}

const isFlagged = (e) => Boolean(e.srd52 || e.basicRules2024);

function ownFeatures(creature) {
  const out = [];
  for (const section of SECTIONS) {
    for (const f of Array.isArray(creature[section]) ? creature[section] : []) {
      if (typeof f?.name === "string") out.push({ section, name: f.name, text: plainText(f.entries) });
    }
    if (section === "trait") {
      for (const block of Array.isArray(creature.spellcasting) ? creature.spellcasting : []) {
        const name = typeof block?.name === "string" ? block.name : "Spellcasting";
        out.push({ section, name, text: spellcastingText(block ?? {}), spellcastingBlock: true });
      }
    }
  }
  return out;
}

/**
 * The creatures of `bookCode` and their features: `{ features, creatures }`. `features` is `[{ name, kind: "monster", owner,
 * section, book, page, edition, srd, text, keyName?, occurrence?, copyOf? }]`; `name` is the base name (no recharge, cost or
 * limit marker), `keyName` the name the key is derived from when it is not `name` (keyFeatureName), and
 * `occurrence` (2, 3, ...) numbers a key name repeated within one creature and section, in dataset order (inventory renumbers
 * against the registry); `spellcastingBlock` marks a spellcasting block (listed
 * as a trait, whatever its item's activation); `creatureIndex` is the position of the creature in the book, which tells
 * same-named creatures apart. A `_copy` creature lists its own sections only (nothing is inherited) and carries `copyOf` =
 * "<base name>|<base source>". `creatures` is
 * `[{ name, features, copyOf? }]`, every creature of the book, the ones with no feature of their own included.
 */
export function readMonsters(datasetDir, bookCode, { year } = {}) {
  const row = KIND_TABLE.monster;
  const raw = [];
  for (const rel of row.files(bookCode, datasetDir)) {
    const file = join(datasetDir, rel);
    if (existsSync(file)) raw.push(...row.list(JSON.parse(readFileSync(file, "utf8"))));
  }
  const sameBook = (e) => String(e.source ?? bookCode).toUpperCase() === bookCode.toUpperCase();
  const own = raw.filter((e) => typeof e?.name === "string" && sameBook(e));
  const edition = editionOf(bookCode, { year, flagged: own.some(isFlagged) });
  const features = [];
  const creatures = [];
  for (const [creatureIndex, creature] of own.entries()) {
    const copyOf = creature._copy?.name ? `${creature._copy.name}|${creature._copy.source ?? ""}` : undefined;
    const counts = new Map();
    let n = 0;
    // A name that slugs to nothing is still listed: inventory counts it under `skipped` instead of keying it.
    for (const f of ownFeatures(creature)) {
      const name = baseFeatureName(f.name);
      const keyName = keyFeatureName(f.name);
      const id = `${f.section}/${slug(keyName)}`;
      const occurrence = (counts.get(id) ?? 0) + 1;
      counts.set(id, occurrence);
      n += 1;
      features.push({
        name, kind: "monster", owner: creature.name, section: f.section, book: bookCode, page: creature.page, edition,
        srd: Boolean(creature.srd52 || creature.srd), text: f.text, creatureIndex,
        ...(keyName !== name ? { keyName } : {}), ...(f.spellcastingBlock ? { spellcastingBlock: true } : {}),
        ...(occurrence > 1 ? { occurrence } : {}), ...(copyOf ? { copyOf } : {}),
      });
    }
    creatures.push({ name: creature.name, features: n, ...(copyOf ? { copyOf } : {}) });
  }
  return { features, creatures };
}

export const readMonsterFeatures = (datasetDir, bookCode, opts) => readMonsters(datasetDir, bookCode, opts).features;

const itemIdOf = (docId) => String(docId).split(".").pop();

/**
 * The official candidates of a creature's features: the embedded items of the actors named as the creature (`actors` is
 * `[{ id, name, items: [item summaries, docId "<actor>.<item>"] }]`). Several actors of the name with identical embedded item
 * ids are one; with differing ones the candidates of all of them come back and `ambiguous` is true. `found` is false when no
 * actor has the name.
 */
export function actorCandidates(creature, actors) {
  const wanted = matchName(creature).full;
  const named = (actors ?? []).filter((a) => matchName(a.name).full === wanted);
  if (!named.length) return { found: false, ambiguous: false, candidates: [] };
  const signature = (a) => a.items.map((i) => itemIdOf(i.docId)).sort().join("|");
  const ambiguous = new Set(named.map(signature)).size > 1;
  return { found: true, ambiguous, candidates: (ambiguous ? named : [named[0]]).flatMap((a) => a.items) };
}
