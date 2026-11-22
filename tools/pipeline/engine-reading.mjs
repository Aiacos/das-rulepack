// What DAS · Core reads by itself in a monster feature (its "text" layer), and how a pack rule compares with it (Ruling R29).
//
// The engine builds an item's entry by merging layers key by key: `mergeEntries([text, enchant, module, world, item])`
// (`adapter/content.mjs` `contentOf`; the strategy of each key in `core/content/merge.mjs` `MERGE`). A registered pack rule is
// the `module` layer: it overrides the engine's reading KEY BY KEY (`triggers` as a whole list, `shallow` keys field by field),
// it does not replace the reading wholesale. The text layer is the engine's pure `monsterTextLayer` (`core/monster-layer.mjs`),
// imported from the DAS_CORE clone at run time (`core.mjs` `loadCore`), never copied; its arguments are built here from the
// dump's item document as `textLayer(item)` builds them from the live item. Nothing here writes to the clone.
import { canonical, ruleFingerprint } from "./registry.mjs";
import { READING_TRIGGERS, readingProblems } from "./schema.mjs";

// The closed shape of `evidence.reading` lives with the other evidence shapes (schema.mjs), which the schema gate checks.
export { READING_TRIGGERS, readingProblems };
const KEY_LISTS = ["delta", "same", "changes"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const sorted = (list) => [...list].sort();

function textLayerOf(core) {
  if (typeof core?.monsterTextLayer !== "function") {
    throw new Error(`DAS_CORE ${core?.version ?? "(unknown version)"}: core/monster-layer.mjs does not export monsterTextLayer`
      + " (the engine is older or newer than this pipeline): the engine's reading of a monster feature cannot be computed");
  }
  return core.monsterTextLayer;
}
function mergeOf(core) {
  if (typeof core?.mergeEntries !== "function") {
    throw new Error(`DAS_CORE ${core?.version ?? "(unknown version)"}: core/content.mjs does not export mergeEntries`
      + " (the engine is older or newer than this pipeline): a rule cannot be merged with the engine's reading");
  }
  return core.mergeEntries;
}

// §461 of the engine (`activityShape`): range, template and target of an activity as the data writes them.
const activityShape = (a) => ({
  range: { value: a.range?.value ?? null, units: a.range?.units ?? "", special: a.range?.special ?? "" },
  template: a.target?.template?.type ? { type: a.target.template.type, size: a.target.template.size ?? "",
    units: a.target.template.units ?? "", count: a.target.template.count ?? "" } : false,
  target: { type: a.target?.affects?.type ?? "", count: a.target?.affects?.count ?? "", special: a.target?.affects?.special ?? "" }
});

/**
 * The arguments of `monsterTextLayer` for an item document of the dumps, built as the engine's `textLayer(item)` builds them
 * from the live item: the original English description (a translation keeps it in `flags.babele.originalPayload`), each
 * effect's id, statuses and changes (`changes`, or `system.changes` where the data model keeps them), each activity's id,
 * name, type, activation, effect ids and `onSave`, and its range, template and target as the data writes them.
 */
export function textLayerInput(item, { identifier = null, swallow = false } = {}) {
  const html = item?.flags?.babele?.originalPayload?.description ?? item?.system?.description?.value ?? "";
  const activities = isObject(item?.system?.activities) ? Object.entries(item.system.activities) : [];
  return {
    html, identifier, swallow: !!swallow,
    effects: (Array.isArray(item?.effects) ? item.effects : []).map((e) => ({ id: e._id ?? e.id, statuses: [...(e.statuses ?? [])],
      changes: e.changes ?? e.system?.changes ?? [] })),
    activities: activities.map(([key, a]) => ({ id: a._id ?? key, name: a.name ?? "", type: a.type,
      activation: { type: a.activation?.type, condition: a.activation?.condition ?? "" },
      effects: (a.effects ?? []).map((e) => e._id ?? e.id), onSave: a.damage?.onSave ?? null, ...activityShape(a) }))
  };
}

// A plain kebab-case form of a name, for an item that states no identifier (the engine slugifies the name with Foundry's own
// function, which needs Foundry): only the "this attack" conditions of a reading name the identifier.
const kebab = (name) => String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
  .replace(/[\s-]+/g, "-").replace(/[^a-z0-9-]/g, "");

/**
 * The engine's text-layer entry for an official embedded monster item of the dumps, or null when it reads nothing (or the
 * item is a spell, or not on an NPC: the engine reads neither). `identifier`: the one the engine would see (a ruled record's
 * own, which its `sources` bind); left out, the engine's shipped sources (`<actor id>.<item id>`, then the item id), then the
 * item's `system.identifier`, then its name in kebab case. Throws when the clone does not export `monsterTextLayer`.
 */
export function engineReading(item, core, { identifier, actorId, actorType = "npc", swallow } = {}) {
  const layer = textLayerOf(core);
  if (actorType !== "npc" || !isObject(item) || item.type === "spell") return null;
  const sources = isObject(core.sources) ? core.sources : {};
  const own = (key) => (Object.hasOwn(sources, key) ? sources[key] : undefined);
  const id = identifier ?? (actorId ? own(`${actorId}.${item._id}`) : undefined) ?? own(item._id)
    ?? (item.system?.identifier || kebab(item.name) || null);
  const shipped = isObject(core.shipped) && Object.hasOwn(core.shipped, id) ? core.shipped[id] : null;
  const input = textLayerInput(item, { identifier: id, swallow: swallow ?? !!shipped?.swallow });
  if (!input.html) return null;
  const reading = layer(input);
  return isObject(reading) && Object.keys(reading).length ? reading : null;
}

const same = (a, b) => canonical(a) === canonical(b);
const listOf = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * A rule's entry against the engine's reading, key by key for every key the rule declares: `same` (deep-equal to the
 * reading's), `adds` (the reading has no such key) or `changes`. For `triggers`, which a later layer replaces whole: `same`,
 * `superset` (the rule's list contains every trigger of the reading: nothing the engine read is lost), `drops` (with the
 * engine triggers it loses in `dropped`) or `none` (the rule declares none). `engineOnly`: the keys only the reading has.
 * `delta`: what the pack must register (the `adds` keys, and `triggers` whole when it is a superset); `held`: the keys that
 * change the reading otherwise. `mergedEntry`: what the engine ends up with, from its own `mergeEntries` (reading first).
 */
export function compareWithReading(ruleEntry, reading, core) {
  const merge = mergeOf(core);
  const rule = isObject(ruleEntry) ? ruleEntry : {};
  const read = isObject(reading) ? reading : {};
  const keys = {};
  for (const key of Object.keys(rule)) {
    keys[key] = !Object.hasOwn(read, key) ? "adds" : same(rule[key], read[key]) ? "same" : "changes";
  }
  let triggers = "none";
  let dropped = [];
  if (Object.hasOwn(rule, "triggers")) {
    const mine = listOf(rule.triggers).map(canonical);
    const theirs = listOf(read.triggers);
    dropped = theirs.filter((t) => !mine.includes(canonical(t)));
    triggers = same(listOf(rule.triggers), theirs) ? "same" : dropped.length ? "drops" : "superset";
    if (triggers === "same") keys.triggers = "same";
  }
  const named = (outcome) => sorted(Object.keys(keys).filter((k) => keys[k] === outcome));
  const supersetTriggers = keys.triggers === "changes" && triggers === "superset";
  return {
    keys, same: named("same"), adds: named("adds"), changes: named("changes"),
    engineOnly: sorted(Object.keys(read).filter((k) => !Object.hasOwn(rule, k))),
    triggers, dropped,
    delta: sorted([...named("adds"), ...(supersetTriggers ? ["triggers"] : [])]),
    held: named("changes").filter((k) => !(k === "triggers" && supersetTriggers)),
    mergedEntry: merge([isObject(reading) ? reading : null, isObject(ruleEntry) ? ruleEntry : null])
  };
}

/** The matched official item of a record that carries a data fingerprint, or null. */
export const officialItemOf = (record) => (Array.isArray(record?.items) ? record.items : [])
  .find((i) => i?.origin === "official" && i.match === "matched" && typeof i.data?.sha256 === "string") ?? null;

/**
 * `evidence.reading`, written by `npm run gates` (it needs the dumps and DAS_CORE, which CI has not): `{ at, core, rule, item,
 * delta, same, changes, triggers }` — the engine version, the fingerprints of the rule and of the official item's data it was
 * computed on, the keys the pack registers (`delta`), those the engine already reads the same (`same`), those that change
 * the reading (`changes`: every changed key but a superset `triggers`, which is in `delta`), and the trigger outcome.
 */
export function readingEvidence(record, comparison, { at = new Date().toISOString(), core } = {}) {
  return { at, core: core?.version, rule: ruleFingerprint(record.rule), item: officialItemOf(record)?.data?.sha256,
    delta: [...comparison.delta], same: [...comparison.same], changes: [...comparison.held], triggers: comparison.triggers };
}

/**
 * The record's `evidence.reading` when it stands for the record as it is — its rule (fingerprint), its official item (data
 * fingerprint), a sound shape, and its three key lists together exactly the keys of `rule.entry` — or null (fail closed).
 */
export function currentReading(record) {
  const reading = record?.evidence?.reading;
  if (!isObject(reading) || readingProblems(reading).length || !isObject(record.rule?.entry)) return null;
  if (reading.rule !== ruleFingerprint(record.rule) || reading.item !== officialItemOf(record)?.data?.sha256) return null;
  const listed = sorted(KEY_LISTS.flatMap((f) => reading[f]));
  return canonical(listed) === canonical(sorted(Object.keys(record.rule.entry))) ? reading : null;
}

/** What the pack registers for a rule whose reading stands: the keys of `delta`, taken from the rule's own entry. */
export const deltaEntry = (entry, reading) =>
  Object.fromEntries(reading.delta.filter((k) => Object.hasOwn(entry, k)).map((k) => [k, structuredClone(entry[k])]));
