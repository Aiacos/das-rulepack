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

export function itemSummary(doc, origin) {
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
