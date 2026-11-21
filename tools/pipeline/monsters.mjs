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
// A parenthesised qualifier that says how a feature is paid for or limited: (Costs 2 Actions), (3/Day), (Recharge 5-6),
// (Recharges after a Short or Long Rest), (At Will). Any other group ("(Beast)") belongs to the name.
const QUALIFIER = /\s*\((?:costs?\b|recharges?\b|at will\b|[^()]*\d\s*\/\s*(?:day|rest|turn|short|long))[^()]*\)/gi;

/** The name of a feature without the recharge markup and the cost or use qualifiers; those are in its text. */
export function baseFeatureName(name) {
  return plainText(String(name ?? "").replace(RECHARGE_TAG, " ").replace(QUALIFIER, " ")).replace(/\s+/g, " ").trim();
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
        out.push({ section, name, text: spellcastingText(block ?? {}) });
      }
    }
  }
  return out;
}

/**
 * The creatures of `bookCode` and their features: `{ features, creatures }`. `features` is `[{ name, kind: "monster", owner,
 * section, book, page, edition, srd, text, occurrence?, copyOf? }]`; `name` is the base name (no recharge or cost marker) and
 * `occurrence` (2, 3, ...) numbers a name repeated within one creature and section, in dataset order. A `_copy` creature lists
 * its own sections only (nothing is inherited) and carries `copyOf` = "<base name>|<base source>". `creatures` is
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
  for (const creature of own) {
    const copyOf = creature._copy?.name ? `${creature._copy.name}|${creature._copy.source ?? ""}` : undefined;
    const counts = new Map();
    let n = 0;
    if (slug(creature.name)) {
      for (const f of ownFeatures(creature)) {
        const name = baseFeatureName(f.name);
        const id = `${f.section}/${slug(name)}`;
        if (!slug(name)) continue;
        const occurrence = (counts.get(id) ?? 0) + 1;
        counts.set(id, occurrence);
        n += 1;
        features.push({
          name, kind: "monster", owner: creature.name, section: f.section, book: bookCode, page: creature.page, edition,
          srd: Boolean(creature.srd52 || creature.srd), text: f.text,
          ...(occurrence > 1 ? { occurrence } : {}), ...(copyOf ? { copyOf } : {}),
        });
      }
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
