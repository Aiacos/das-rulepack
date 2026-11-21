// What inventory and `resolve` share: the registry item of a matched document, what a person settled, the reprints of a document
// in other official packages, and the identifiers the engine will meet.
import { slug } from "./registry.mjs";
import { matchName } from "./match.mjs";

export function itemOf(origin, outcome) {
  if (outcome.match === "matched") {
    const { item, differences, alsoDocIds } = outcome;
    return {
      origin, match: "matched", identifier: item.identifier ?? slug(item.name), docId: item.docId,
      activities: item.activities.map((a) => a.id), effects: item.effects.map((e) => e.id), data: { sha256: item.data },
      ...(differences?.length ? { differences } : {}), ...(alsoDocIds?.length ? { alsoDocIds: [...alsoDocIds].sort() } : {})
    };
  }
  const candidates = outcome.candidates.map((c) => ({ identifier: c.identifier ?? slug(c.name), docId: c.docId }));
  return { origin, match: "ambiguous", candidates, differences: outcome.differences };
}


const ORIGIN_ORDER = ["official", "ddb-importer", "plutonium"];
const byOrigin = (a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin);
const DOC_ID = /^[A-Za-z0-9]{16}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// The item summaries an origin offers for a record of `kind` (a monster feature's are the items embedded in its actors).
// For a monster feature only the actors of its creature (`owner`) count.
export const poolOf = (dumps, origin, kind, owner) => {
  if (origin === "official" && kind === "monster") {
    const wanted = owner === undefined ? null : matchName(owner).full;
    return (dumps.actors ?? []).filter((a) => wanted === null || matchName(a.name).full === wanted).flatMap((a) => a.items);
  }
  return dumps[origin] ?? [];
};

/**
 * Applies what a person settled with `resolve` to the items matching just produced. An item that was settled to one document
 * stays that item while the document is in the dump with the same data fingerprint; an origin settled as absent stays absent
 * while matching offers the same candidates (or none). Anything else goes back to what matching says and is stale.
 * @returns {{ items: object[], resolutions: object[], stale: boolean }}
 */
export function keepSettled(existing, items, dumps, kind) {
  let stale = false;
  let next = [...items];
  const resolutions = [];
  for (const origin of ["official", "ddb-importer"]) {
    const old = (existing.items ?? []).find((i) => i.origin === origin && i.match === "matched" && i.resolved);
    if (old) {
      const doc = poolOf(dumps, origin, kind, existing.owner).find((c) => c.docId === old.docId);
      if (doc && doc.data === old.data?.sha256) {
        const kept = { ...itemOf(origin, { match: "matched", item: doc, differences: old.differences }), resolved: old.resolved };
        next = [...next.filter((i) => i.origin !== origin), kept];
      } else stale = true;
    }
    const gone = (existing.resolutions ?? []).find((r) => r.origin === origin);
    if (gone) {
      const current = next.find((i) => i.origin === origin);
      const offered = current?.match === "ambiguous" ? current.candidates.map((c) => c.docId).sort() : [];
      // An item that was matched when it was refused stays refused while its document keeps its data.
      const same = gone.was
        ? current?.match === "matched" && current.docId === gone.was.docId && current.data?.sha256 === gone.was.sha256
        : current?.match === "ambiguous" && sameList(offered, gone.candidates ?? []);
      if (!current || same) {
        next = next.filter((i) => i.origin !== origin);
        resolutions.push(gone);
      } else stale = true;
    }
  }
  return { items: next.sort(byOrigin), resolutions, stale };
}

/**
 * The other official packages that hold the official item's document id: `[{ package, docId, sameIds, missing? }]`.
 * `sameIds` compares the sets of activity and effect ids; when they differ, `missing` lists the ids of the item that the
 * reprint does not have. `index` is the `reprints` of the dumps: Map of document id to [{ package, type, activities, effects }].
 * Only a document of one of `types` (the record kind's document types) is a reprint: another document that shares the id is
 * something else.
 */
export function reprintsOf(item, index, previous, types) {
  if (!Array.isArray(types)) throw new Error("reprintsOf needs the document types of the record's kind");
  const found = (index?.get(item.docId) ?? []).filter((r) => types.includes(r.type));
  const mine = { activities: [...item.activities].sort(), effects: [...item.effects].sort() };
  const reprints = found.map((r) => {
    const same = sameList(mine.activities, [...r.activities].sort()) && sameList(mine.effects, [...r.effects].sort());
    const has = new Set([...r.activities, ...r.effects]);
    const missing = [...mine.activities, ...mine.effects].filter((id) => !has.has(id)).sort();
    return { package: r.package, docId: item.docId, sameIds: same, ...(same ? {} : { missing }) };
  }).sort((a, b) => (a.package < b.package ? -1 : a.package > b.package ? 1 : 0));
  const excluded = (previous?.reprintsExcluded ?? []).filter((x) => reprints.some((r) => r.package === x.package));
  return { reprints, excluded };
}

/**
 * Binds the identifiers: an item whose identifier is not the record's gets its document id in `sources` ({ docId: identifier },
 * what the engine registers with `register(source, table, { sources })`). The engine takes a 16-character document id as key,
 * so only the official packages' documents qualify: a DDB Importer item lives in a world, where the id is the world's own, and
 * a monster feature's id is "<actor>.<item>"; those are flagged `identifierDiffers` on the item instead.
 * Mutates `items`; returns the sources (empty when there are none).
 */
export function bindSources(items, identifier) {
  const sources = {};
  for (const item of items) {
    delete item.identifierDiffers;
    if (item.match !== "matched" || item.identifier === identifier) continue;
    const ids = [item.docId, ...(item.alsoDocIds ?? [])];
    if (item.origin === "official" && KEBAB.test(identifier) && ids.every((id) => DOC_ID.test(id))) {
      for (const id of ids) sources[id] = identifier;
    } else item.identifierDiffers = true;
  }
  return sources;
}

export const canonicalIdentifier = (items, name) =>
  items.find((i) => i.origin === "official" && i.match === "matched")?.identifier
  ?? items.find((i) => i.origin === "ddb-importer" && i.match === "matched")?.identifier
  ?? slug(name);


/**
 * What is wrong with the `sources` of a record: each key must be the docId, or one of the alsoDocIds, of its matched official
 * item, and each value its own identifier (the engine would otherwise know a document by an identifier the record does not
 * register). Messages start with "sources:".
 */
export function sourceProblems(record) {
  if (!record?.sources || typeof record.sources !== "object" || Array.isArray(record.sources)) return [];
  const official = (record.items ?? []).find((i) => i?.origin === "official" && i.match === "matched");
  const own = new Set(official ? [official.docId, ...(official.alsoDocIds ?? [])] : []);
  const out = [];
  for (const [docId, identifier] of Object.entries(record.sources)) {
    const shown = docId.slice(0, 80);
    if (!own.has(docId)) out.push(`sources: ${shown} is not an item of this record`);
    else if (identifier !== record.identifier) out.push(`sources: ${shown} is bound to an identifier other than the record's`);
  }
  return out;
}
