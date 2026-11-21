// Inventory: one registry record per rulebook entry, with the same item as found in each source ("origin").
import { keyOf, slug, canonical, groupBy } from "./registry.mjs";
import { cacheText } from "./text.mjs";
import { identityOf, matchOrigin } from "./match.mjs";
import { KIND_TABLE } from "./kinds.mjs";
import { actorCandidates } from "./monsters.mjs";

// The kinds inventory can read, in the order `inventory <BOOK> all` runs them.
export const INVENTORY_KINDS = Object.freeze(
  ["spell", "feat", "option", "feature", "species", "background", "item", "monster"]
);
const identityOfRecord = (r) =>
  identityOf({
    name: r.name, kind: r.kind, edition: r.edition, owner: r.owner, section: r.section, level: r.level, occurrence: r.occurrence
  });

// What the dataset entry contributes to the record besides the common fields: owner (features, species traits), level
// (features only: a spell's level is not the record's), rarity (items), the section and repeat number of a monster feature,
// and the name an entry was copied from.
const extrasOf = (entry, kind) => ({
  ...(entry.owner ? { owner: entry.owner } : {}),
  ...(kind === "monster" && entry.section ? { section: entry.section } : {}),
  ...(kind === "monster" && entry.occurrence > 1 ? { occurrence: entry.occurrence } : {}),
  ...(kind === "feature" && entry.level != null ? { level: entry.level } : {}),
  ...(kind === "item" && entry.rarity ? { rarity: entry.rarity } : {}),
  ...(entry.copyOf ? { copyOf: entry.copyOf } : {}),
});

function itemOf(origin, outcome) {
  if (outcome.match === "matched") {
    const { item, differences } = outcome;
    return {
      origin, match: "matched", identifier: item.identifier ?? slug(item.name), docId: item.docId,
      activities: item.activities.map((a) => a.id), effects: item.effects.map((e) => e.id), data: { sha256: item.data },
      ...(differences?.length ? { differences } : {})
    };
  }
  const candidates = outcome.candidates.map((c) => ({ identifier: c.identifier ?? slug(c.name), docId: c.docId }));
  return { origin, match: "ambiguous", candidates, differences: outcome.differences };
}

// A monster feature is matched against the items embedded in the actor of its creature, nowhere else. When several actors
// of the name differ in their embedded items, a feature found in any of them is ambiguous between those items.
function monsterOfficial(entry, actors) {
  const subject = { name: entry.name, kind: "monster", edition: entry.edition };
  const { found, ambiguous, candidates } = actors;
  if (!found) return { match: "absent" };
  if (!ambiguous) return matchOrigin(subject, candidates);
  const perActor = [...groupBy(candidates, (c) => String(c.docId).split(".")[0]).values()];
  const outcomes = perActor.map((items) => matchOrigin(subject, items)).filter((o) => o.match !== "absent");
  if (!outcomes.length) return { match: "absent" };
  return {
    match: "ambiguous", candidates: outcomes.flatMap((o) => o.candidates ?? [o.item]), differences: ["actor"]
  };
}

// Official first with no reference; ddb-importer is then compared against the official item when there is one.
function itemsFor(entry, kind, dumps, actors) {
  if (kind === "monster") {
    const official = monsterOfficial(entry, actors);
    return [...(official.match !== "absent" ? [itemOf("official", official)] : []), { origin: "plutonium", match: "unchecked" }];
  }
  const subject = {
    name: entry.name, kind, edition: entry.edition, owner: entry.owner, level: entry.level, rarity: entry.rarity
  };
  const official = matchOrigin(subject, dumps.official ?? []);
  const reference = official.match === "matched" ? official.item : undefined;
  const ddb = matchOrigin({ ...subject, reference }, dumps["ddb-importer"] ?? []);
  const items = [];
  if (official.match !== "absent") items.push(itemOf("official", official));
  if (ddb.match !== "absent") items.push(itemOf("ddb-importer", ddb));
  items.push({ origin: "plutonium", match: "unchecked" });
  return items;
}

const dataFingerprints = (items) =>
  canonical(items.filter((i) => i.match === "matched").map((i) => [i.origin, i.data]));

const canonicalIdentifier = (items, name) =>
  items.find((i) => i.origin === "official" && i.match === "matched")?.identifier
  ?? items.find((i) => i.origin === "ddb-importer" && i.match === "matched")?.identifier
  ?? slug(name);

// `previous` holds the records of every book already in the registry; they are returned (not mutated) with the
// entries of `book` added or refreshed. A reprint of an entry known from another book only extends its `alsoIn`.
// A record is found by its identity; if its key is not the one the entry would get now, that is a bug and it throws.
// Two entries of one book with one key are a collision: the first gets the record, both are reported, the second gets none.
export function inventory({ book, kind, dataset, creatures, dumps, textDir, previous }) {
  if (!INVENTORY_KINDS.includes(kind) || !KIND_TABLE[kind]) {
    throw new Error(`Kind ${JSON.stringify(kind)} cannot be inventoried (${INVENTORY_KINDS.join(", ")})`);
  }
  const records = structuredClone(previous);
  const byIdentity = new Map(records.map((r) => [identityOfRecord(r), r]));
  const report = {
    added: 0, kept: 0, skipped: 0, textChanged: [], dataChanged: [], ambiguous: [], noOfficial: [], differing: [], noPage: [],
    collisions: [], textVanished: []
  };
  // Monsters also report the creatures read (with the ones that have no feature of their own), the `_copy` ones, and the
  // creatures with no actor of their name in the official dump.
  const actorsOf = new Map();
  const actorsFor = (creature) => {
    if (!actorsOf.has(creature)) actorsOf.set(creature, actorCandidates(creature, dumps.actors));
    return actorsOf.get(creature);
  };
  if (kind === "monster") {
    const list = creatures ?? [...new Set(dataset.map((e) => e.owner))].map((name) => ({ name }));
    Object.assign(report, {
      creatures: list.length, copies: list.filter((c) => c.copyOf).length,
      noActor: list.filter((c) => !actorsFor(c.name).found).length
    });
  }
  const seen = new Map();

  for (const entry of dataset) {
    // A feature whose owner cannot be named has no key of its own: it is counted, never keyed under a guess.
    if (kind === "feature" && !entry.owner) { report.skipped += 1; continue; }
    const key = keyOf({
      book, kind, name: entry.name, owner: entry.owner, section: entry.section, level: entry.level, occurrence: entry.occurrence
    });
    if (seen.has(key)) {
      const found = report.collisions.find((c) => c.key === key);
      if (found) found.entries.push({ name: entry.name, page: entry.page ?? null });
      else {
        const first = seen.get(key);
        report.collisions.push({ key, entries: [{ name: first.name, page: first.page ?? null },
          { name: entry.name, page: entry.page ?? null }] });
      }
      continue;
    }
    seen.set(key, entry);
    const identity = identityOf({
      name: entry.name, kind, edition: entry.edition, owner: entry.owner, section: entry.section, level: entry.level,
      occurrence: entry.occurrence
    });
    const existing = byIdentity.get(identity);

    if (existing && existing.book !== book) {
      report.kept += 1;
      const also = (existing.alsoIn ??= []);
      if (entry.page && !also.some((a) => a.book === book)) also.push({ book, page: entry.page });
      if (!entry.page) report.noPage.push(existing.key);
      continue;
    }
    if (existing && existing.key !== key) {
      throw new Error(`${existing.key}: the same entry would now be keyed ${key}; a key never changes`);
    }

    const sha256 = entry.text ? cacheText(textDir, entry.text) : null;
    const text = sha256 ? { sha256, source: "5etools", chars: entry.text.length } : null;
    const items = itemsFor(entry, kind, dumps, kind === "monster" ? actorsFor(entry.owner) : undefined);
    const fresh = {
      identifier: canonicalIdentifier(items, entry.name), page: entry.page ?? null, srd: Boolean(entry.srd), text, items
    };

    let record = existing;
    if (existing) {
      report.kept += 1;
      // A text that was fingerprinted and is now empty is kept as it was (and listed): the gates still stand on it.
      const vanished = Boolean(existing.text) && !sha256;
      if (vanished) {
        delete fresh.text;
        report.textVanished.push(existing.key);
      }
      const textChanged = existing.text && !vanished && existing.text.sha256 !== sha256;
      const dataChanged = dataFingerprints(existing.items) !== dataFingerprints(items);
      // A record that has a rule keeps its identifier: the rule is registered under it.
      if (existing.rule) delete fresh.identifier;
      Object.assign(existing, fresh);
      if (textChanged) report.textChanged.push(existing.key);
      if (dataChanged) report.dataChanged.push(existing.key);
      if ((textChanged || dataChanged) && existing.evidence?.gates) delete existing.evidence.gates;
    } else {
      record = {
        key, name: entry.name, kind, book, edition: entry.edition, ...extrasOf(entry, kind), ...fresh, verdict: null,
        evidence: {}
      };
      records.push(record);
      report.added += 1;
    }
    if (!record.page) report.noPage.push(record.key);
    if (items.some((i) => i.match === "ambiguous")) report.ambiguous.push(record.key);
    if (items.some((i) => i.match === "matched" && i.differences)) report.differing.push(record.key);
    if (!items.some((i) => i.origin === "official" && i.match === "matched")) report.noOfficial.push(record.key);
  }
  return { records, report };
}
