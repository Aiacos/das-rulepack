// Reader for the compendium dumps (RULEPACK_DUMPS: <package>.<pack>.json, each a JSON array of Foundry documents).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { canonical } from "./registry.mjs";

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
  };
  if (system.level !== undefined) summary.level = system.level;
  if (system.school !== undefined) summary.school = system.school;
  if (typeof system.rarity === "string" && system.rarity) summary.rarity = system.rarity;
  if (system.type && typeof system.type === "object" && doc.type === "feat") {
    summary.featType = { value: system.type.value ?? "", subtype: system.type.subtype ?? "" };
  }
  if (typeof system.requirements === "string" && system.requirements) summary.requirements = system.requirements;
  if (grants?.get(doc._id)) summary.grantedBy = grants.get(doc._id);
  summary.data = sha256(canonical({ system, effects }));
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
