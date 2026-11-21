// Reader for the compendium dumps (RULEPACK_DUMPS: <package>.<pack>.json, each a JSON array of Foundry documents).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "./registry.mjs";
import { KIND_TABLE } from "./kinds.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const sortedUnique = (list) => [...new Set(list)].sort();

export const readDump = (file) => JSON.parse(readFileSync(file, "utf8"));

function activitySummary(id, activity) {
  const parts = activity.damage?.parts ?? [];
  const out = { id, type: activity.type };
  if (activity.save) out.save = sortedUnique([activity.save.ability ?? []].flat());
  out.damageTypes = sortedUnique(parts.flatMap((p) => [p.types ?? []].flat()));
  return out;
}

// Who hands a document out: the class, subclass and race documents of a dump list the feature documents they grant (an
// ItemGrant advancement holds their uuids). Returns a Map of document id to [{ class?, subclass?, race?, level? }] where each
// value is the slug-ready identifier or name of the granting document; this is what tells two same-name features apart.
export function grantIndex(docs) {
  const index = new Map();
  const add = (id, grant) => index.set(id, [...(index.get(id) ?? []), grant]);
  for (const doc of docs) {
    if (!["class", "subclass", "race"].includes(doc.type)) continue;
    const sys = doc.system ?? {};
    const owner = doc.type === "class" ? { class: sys.identifier ?? doc.name }
      : doc.type === "subclass" ? { class: sys.classIdentifier, subclass: [sys.identifier, doc.name].filter(Boolean) }
        : { race: doc.name };
    for (const adv of Object.values(sys.advancement ?? {})) {
      if (adv?.type !== "ItemGrant") continue;
      for (const item of adv.configuration?.items ?? []) {
        const id = String(item?.uuid ?? "").split(".").pop();
        if (id) add(id, { ...owner, ...(Number.isInteger(adv.level) ? { level: adv.level } : {}) });
      }
    }
  }
  return index;
}

const ACTIVATIONS = ["action", "bonus", "reaction", "legendary", "mythic"];
// How an item is activated, as the section of a stat block that would list it: `trait` for a passive activity (an empty
// activation type), the type itself for action, bonus, reaction, legendary and mythic. An item with no activity, an activity
// that states nothing, or another timing (special, a turn's start or end, an hour) says nothing: the list is empty (neutral).
function activationsOf(activities) {
  const entries = Object.values(activities ?? {});
  const types = entries.filter((a) => a?.activation && typeof a.activation === "object").map((a) => a.activation.type ?? "");
  return sortedUnique(types.flatMap((t) => (ACTIVATIONS.includes(t) ? [t] : ["", "none", "passive"].includes(t) ? ["trait"] : [])));
}

// The fields in which copies of one item differ without the item being another: where it is kept, how many, which printing,
// and the state a character gives it.
const COPY_FIELDS = [["container"], ["quantity"], ["source", "revision"], ["equipped"], ["attuned"], ["identified"]];

/** The fingerprint of what an item does: its `system` and `effects` without the fields in which copies of it differ. */
export function mechanicsFingerprint(system, effects) {
  const rest = structuredClone(system ?? {});
  for (const path of COPY_FIELDS) {
    const holder = path.slice(0, -1).reduce((o, k) => o?.[k], rest);
    if (holder && typeof holder === "object") delete holder[path.at(-1)];
  }
  return sha256(canonical({ system: rest, effects }));
}

// The document types the pipeline reads: the item types of every kind, the documents that grant features (class, subclass,
// race), backgrounds and the actors of the monsters. A journal entry or page, a scene or a table is none of them, even when it
// shares an item's id.
export const KNOWN_DOC_TYPES = Object.freeze([...new Set([
  ...Object.values(KIND_TABLE).flatMap((row) => [...row.docTypes, ...(row.traitDocTypes ?? [])]),
  "class", "subclass", "race", "background", "npc", "character"
])]);
const isKnown = (doc) => doc !== null && typeof doc === "object" && KNOWN_DOC_TYPES.includes(doc.type);

/** The data fingerprint of a document, as inventory records it on a matched item (`data.sha256`). */
export const dataFingerprint = (doc) => sha256(canonical({ system: doc?.system ?? {}, effects: doc?.effects ?? [] }));

export function itemSummary(doc, origin, grants) {
  const system = doc.system ?? {};
  const effects = doc.effects ?? [];
  const summary = {
    origin,
    docId: doc._id,
    identifier: system.identifier ?? null,
    name: doc.name,
    type: doc.type,
    rules: system.source?.rules,
    activities: Object.entries(system.activities ?? {}).map(([id, a]) => activitySummary(id, a)),
    effects: effects.map((e) => ({ id: e._id, name: e.name, statuses: [...(e.statuses ?? [])] })),
    activations: activationsOf(system.activities),
  };
  if (system.level !== undefined) summary.level = system.level;
  if (system.school !== undefined) summary.school = system.school;
  if (typeof system.rarity === "string" && system.rarity) summary.rarity = system.rarity;
  if (system.type && typeof system.type === "object" && doc.type === "feat") {
    summary.featType = { value: system.type.value ?? "", subtype: system.type.subtype ?? "" };
  }
  if (doc.type === "subclass" && typeof system.classIdentifier === "string" && system.classIdentifier) {
    summary.classIdentifier = system.classIdentifier;
  }
  if (typeof system.requirements === "string" && system.requirements) summary.requirements = system.requirements;
  if (grants?.get(doc._id)) summary.grantedBy = grants.get(doc._id);
  summary.data = dataFingerprint(doc);
  summary.mechanics = mechanicsFingerprint(system, effects);
  return summary;
}

const isOwn = (name) => name.startsWith("ddb.");
const isForeign = (name) => name.startsWith("ddb.") || name.startsWith("dnd5e.");

export function dumpsFor(dumpsDir, origin) {
  const files = readdirSync(dumpsDir).filter((f) => f.endsWith(".json")).sort();
  if (origin === "official") return files.filter((f) => !isForeign(f));
  if (origin === "ddb-importer") return files.filter(isOwn);
  throw new Error(`No dump files are defined for origin "${origin}"`);
}

// The official dump files of one book: those of the package(s) of `packages` ([{ id, book }]) whose book is `book`.
// A file is named <package id>.<pack>.json. A book that no package maps to has none.
export function officialFilesFor(dumpsDir, packages, book) {
  const ids = packages.filter((p) => p.book && p.book.toUpperCase() === book.toUpperCase()).map((p) => p.id);
  return dumpsFor(dumpsDir, "official").filter((f) => ids.some((id) => f.startsWith(`${id}.`)));
}

// A pack of actors: the pack name (the file name after the package id) contains "actors".
export const isActorFile = (file) => file.slice(0, -".json".length).split(".").slice(1).join(".").includes("actors");

// The edition an actor states in `system.source.rules` ("2014" or "2024"); `{}` when it states none (or another value).
const editionOfActor = (doc) => {
  const rules = String(doc.system?.source?.rules ?? "");
  return rules === "2014" || rules === "2024" ? { edition: rules } : {};
};

// An actor document that embeds items: its embedded items are what the pipeline reads, wherever the dump is (DDB Importer's
// monsters are in a `ddb.` file that is not named after actors).
export const isActorDoc = (doc) => doc !== null && typeof doc === "object" && doc.type === "npc" && Array.isArray(doc.items);

/**
 * The actors of an actor dump, summarised for matching their embedded items: `[{ id, name, edition?, items }]`, each item an
 * `itemSummary` whose `docId` is `<actor id>.<item id>`. A document that embeds no items is left out.
 */
export function actorSummaries(docs, origin) {
  return docs.filter((d) => Array.isArray(d.items)).map((d) => ({
    id: d._id, name: d.name, ...editionOfActor(d),
    items: d.items.map((i) => ({ ...itemSummary(i, origin), docId: `${d._id}.${i._id}` }))
  }));
}

/**
 * The documents of the other official packages, by document id: `Map<docId, [{ package, type, activities, effects }]>`,
 * `activities` and `effects` being the ids the document holds. `files` are dump file names of the folder
 * (`<package>.<pack>.json`); actor packs are left out (an actor id is no item), and so is every document that is not of a type
 * the pipeline knows (a journal page sharing the id is no reprint). Used to tell whether a package reprints a document with the
 * same ids; `settle.mjs reprintsOf` keeps only the types of the record's kind.
 */
export function reprintIndex(dumpsDir, files) {
  const index = new Map();
  for (const file of files) {
    if (isActorFile(file)) continue;
    const pkg = file.split(".")[0];
    for (const doc of readDump(join(dumpsDir, file))) {
      if (typeof doc?._id !== "string" || !isKnown(doc)) continue;
      const row = {
        package: pkg, type: doc.type, activities: Object.keys(doc.system?.activities ?? {}).sort(),
        effects: (doc.effects ?? []).map((e) => e._id).filter(Boolean).sort()
      };
      index.set(doc._id, [...(index.get(doc._id) ?? []), row]);
    }
  }
  return index;
}

/**
 * The raw documents of dump files, by id: `Map<docId, document[]>`, only documents of a type the pipeline knows (never a
 * journal entry or page). In an actor pack (or for an actor document of any dump) the documents are the items embedded in the
 * actors, keyed `<actor id>.<item id>`.
 * Look a document up with findDocument.
 */
export function docIndex(dumpsDir, files) {
  const index = new Map();
  const add = (id, doc) => {
    if (typeof id === "string" && isKnown(doc)) index.set(id, [...(index.get(id) ?? []), doc]);
  };
  for (const file of files) {
    for (const doc of readDump(join(dumpsDir, file))) {
      if (!isActorFile(file) && !isActorDoc(doc)) add(doc?._id, doc);
      else if (isKnown(doc)) for (const item of doc.items ?? []) add(`${doc._id}.${item?._id}`, item);
    }
  }
  return index;
}

/**
 * The document of `docIndex` with this id and, when `sha` is given (an item's `data.sha256`), this data fingerprint; without
 * one, the document of the id when every document of the id has the same data (copies of one item). Null when there is no
 * such document or several different ones could be meant: never another document.
 */
export function findDocument(index, docId, sha) {
  const docs = index.get(docId) ?? [];
  if (typeof sha === "string") return docs.find((d) => dataFingerprint(d) === sha) ?? null;
  return docs.length && docs.every((d) => dataFingerprint(d) === dataFingerprint(docs[0])) ? docs[0] : null;
}
