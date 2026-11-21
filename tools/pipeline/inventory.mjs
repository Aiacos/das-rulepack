// Inventory: one registry record per rulebook entry, with the same item as found in each source ("origin").
import { keyOf, slug, canonical, groupBy } from "./registry.mjs";
import { cacheText, textFingerprint } from "./text.mjs";
import { identityOf, matchOrigin } from "./match.mjs";
import { KIND_TABLE } from "./kinds.mjs";
import { actorCandidates } from "./monsters.mjs";

// The kinds inventory can read, in the order `inventory <BOOK> all` runs them.
export const INVENTORY_KINDS = Object.freeze(
  ["spell", "feat", "option", "feature", "species", "background", "item", "monster"]
);
// A stat block is not a reprint: the identity of a monster feature includes its book.
const identityIn = (book, f) => {
  const id = identityOf(f);
  return f.kind === "monster" ? `${book}|${id}` : id;
};
const identityOfRecord = (r) => identityIn(r.book, {
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

// A monster feature is matched against the items embedded in the actor of its creature, nowhere else. When several actors
// of the name differ in their embedded items, a feature found in any of them is ambiguous between those items.
// Only the embedded items that agree with the feature's section can be it: one that states its activation (action, bonus,
// reaction, legendary, mythic, or trait for a passive one) must state the feature's section; one that states none is neutral.
function monsterOfficial(entry, actors) {
  const subject = { name: entry.name, kind: "monster", edition: entry.edition };
  const { found, ambiguous } = actors;
  if (!found) return { match: "absent" };
  // A spellcasting block is listed as a trait whatever the activation of the item that casts, so its section is not compared.
  const agrees = (c) => entry.spellcastingBlock || !c.activations?.length || c.activations.includes(entry.section);
  const candidates = actors.candidates.filter(agrees);
  if (!ambiguous) {
    const outcome = matchOrigin(subject, candidates);
    if (outcome.match !== "absent") return outcome;
    // Absent only because the section disagrees with the activation of the one same-name item: kept for the claims check.
    const only = matchOrigin(subject, actors.candidates);
    return only.match === "matched" ? { match: "absent", sectionOnly: only } : outcome;
  }
  const perActor = [...groupBy(candidates, (c) => String(c.docId).split(".")[0]).values()];
  const outcomes = perActor.map((items) => matchOrigin(subject, items)).filter((o) => o.match !== "absent");
  if (!outcomes.length) return { match: "absent" };
  return {
    match: "ambiguous", candidates: outcomes.flatMap((o) => o.candidates ?? [o.item]), differences: ["actor"]
  };
}

// Official first with no reference; ddb-importer is then compared against the official item when there is one.
function itemsFor(entry, kind, dumps, monster) {
  if (kind === "monster") {
    const official = monster;
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


// --- What a person settled, other packages that reprint the document, and the identifiers the engine will meet -------------

const ORIGIN_ORDER = ["official", "ddb-importer", "plutonium"];
const byOrigin = (a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin);
const DOC_ID = /^[A-Za-z0-9]{16}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// The item summaries an origin offers for a record of `kind` (a monster feature's are the items embedded in its actors).
export const poolOf = (dumps, origin, kind) => {
  if (origin === "official" && kind === "monster") return (dumps.actors ?? []).flatMap((a) => a.items);
  return dumps[origin] ?? [];
};

/**
 * Applies what a person settled with `resolve` to the items matching just produced. An item that was settled to one document
 * stays that item while the document is in the dump with the same data fingerprint; an origin settled as absent stays absent
 * while matching offers the same candidates (or none). Anything else goes back to what matching says and is stale.
 * @returns {{ items: object[], resolutions: object[], stale: boolean }}
 */
function keepSettled(existing, items, dumps, kind) {
  let stale = false;
  let next = [...items];
  const resolutions = [];
  for (const origin of ["official", "ddb-importer"]) {
    const old = (existing.items ?? []).find((i) => i.origin === origin && i.match === "matched" && i.resolved);
    if (old) {
      const doc = poolOf(dumps, origin, kind).find((c) => c.docId === old.docId);
      if (doc && doc.data === old.data?.sha256) {
        const kept = { ...itemOf(origin, { match: "matched", item: doc }), resolved: old.resolved };
        next = [...next.filter((i) => i.origin !== origin), kept];
      } else stale = true;
    }
    const gone = (existing.resolutions ?? []).find((r) => r.origin === origin);
    if (gone) {
      const current = next.find((i) => i.origin === origin);
      const offered = current?.match === "ambiguous" ? current.candidates.map((c) => c.docId).sort() : [current?.docId];
      if (!current || (current.match === "ambiguous" && sameList(offered, gone.candidates ?? []))) {
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
 * reprint does not have. `index` is the `reprints` of the dumps: Map of document id to [{ package, activities, effects }].
 */
export function reprintsOf(item, index, previous) {
  const found = index?.get(item.docId) ?? [];
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

const dataFingerprints = (items) =>
  canonical(items.filter((i) => i.match === "matched").map((i) => [i.origin, i.data]));

export const canonicalIdentifier = (items, name) =>
  items.find((i) => i.origin === "official" && i.match === "matched")?.identifier
  ?? items.find((i) => i.origin === "ddb-importer" && i.match === "matched")?.identifier
  ?? slug(name);

// The official outcome of every monster feature, with one more rule: an embedded item claimed by two features of one creature
// cannot be told which of them it is, so both are ambiguous: `duplicate` when they share a section, else `section`.
function monsterOutcomes(dataset, actorsFor) {
  const outcomes = dataset.map((e) => monsterOfficial(e, actorsFor(e.owner)));
  const claimOf = (e, i) => `${e.creatureIndex ?? e.owner}|${outcomes[i].item.docId}`;
  const claims = groupBy(
    dataset.flatMap((e, i) => (outcomes[i].match === "matched" ? [[claimOf(e, i), i]] : [])), ([claim]) => claim
  );
  const taken = new Set(claims.keys());
  for (const claimants of claims.values()) {
    if (claimants.length < 2) continue;
    for (const [, i] of claimants) {
      const sameSection = claimants.every(([, j]) => dataset[j].section === dataset[claimants[0][1]].section);
      outcomes[i] = {
        match: "ambiguous", candidates: [outcomes[i].item], differences: [sameSection ? "duplicate" : "section"]
      };
    }
  }
  // A feature whose section disagrees with the only same-name item takes it, visibly, when no other feature claims it.
  const fallbackOf = (e, i) => `${e.creatureIndex ?? e.owner}|${outcomes[i].sectionOnly.item.docId}`;
  const wanting = groupBy(
    dataset.flatMap((e, i) => (outcomes[i].sectionOnly ? [[fallbackOf(e, i), i]] : [])), ([claim]) => claim
  );
  for (const [claim, claimants] of wanting) {
    if (taken.has(claim) || claimants.length > 1) continue;
    const [[, i]] = claimants;
    const { item, differences = [], alsoDocIds } = outcomes[i].sectionOnly;
    outcomes[i] = { match: "matched", item, differences: [...differences, "section"], ...(alsoDocIds ? { alsoDocIds } : {}) };
  }
  return outcomes;
}

const numberOf = (r) => r.occurrence ?? 1;

// The repeat number of every monster feature of the run. Among the same-name features of one creature and section, the
// record whose stored text fingerprint equals the feature's keeps its number whatever its position. A lone feature that has
// a lone record and no fingerprint match is a plain text edit: it keeps that record. Every other feature takes the lowest
// number no existing record uses; the records left unmatched stay as they are (listed as vanished).
function numberOccurrences(dataset, records, book) {
  const groups = groupBy(dataset.map((e, i) => [e, i]), ([e]) => `${e.creatureIndex ?? e.owner}|${e.section}|${slug(e.name)}`);
  const numbers = dataset.map((e) => e.occurrence ?? 1);
  for (const members of groups.values()) {
    const [first] = members[0];
    if (!slug(first.name) || !slug(first.owner)) continue;
    const existing = records
      .filter((r) => r.book === book && r.kind === "monster" && r.section === first.section
        && slug(r.owner) === slug(first.owner) && slug(r.name) === slug(first.name))
      .sort((a, b) => numberOf(a) - numberOf(b));
    const free = [...existing];
    const assigned = new Map();
    for (const [e, i] of members) {
      const sha = e.text ? textFingerprint(e.text) : null;
      const at = sha ? free.findIndex((r) => r.text?.sha256 === sha) : -1;
      if (at >= 0) assigned.set(i, numberOf(free.splice(at, 1)[0]));
    }
    const rest = members.filter(([, i]) => !assigned.has(i));
    if (members.length === 1 && existing.length === 1 && rest.length === 1) assigned.set(rest[0][1], numberOf(existing[0]));
    const used = new Set([...existing.map(numberOf), ...assigned.values()]);
    for (const [, i] of rest) {
      if (assigned.has(i)) continue;
      let n = 1;
      while (used.has(n)) n += 1;
      used.add(n);
      assigned.set(i, n);
    }
    for (const [i, n] of assigned) numbers[i] = n;
  }
  return numbers;
}

// `previous` holds the records of every book already in the registry; they are returned (not mutated) with the
// entries of `book` added or refreshed. A reprint of an entry known from another book only extends its `alsoIn`.
// A record is found by its identity; if its key is not the one the entry would get now, that is a bug and it throws.
// Two entries of one book with one key are a collision: the first gets the record, both are reported, the second gets none.
// A record of the book and kind that the run no longer produces is never deleted or rewritten: its key is listed in `vanished`.
export function inventory({
  book, kind, dataset, creatures, dumps, textDir, previous, at = new Date().toISOString().slice(0, 10)
}) {
  if (!INVENTORY_KINDS.includes(kind) || !KIND_TABLE[kind]) {
    throw new Error(`Kind ${JSON.stringify(kind)} cannot be inventoried (${INVENTORY_KINDS.join(", ")})`);
  }
  const records = structuredClone(previous);
  const byIdentity = new Map(records.map((r) => [identityOfRecord(r), r]));
  const report = {
    added: 0, kept: 0, skipped: 0, textChanged: [], dataChanged: [], ambiguous: [], noOfficial: [], differing: [], noPage: [],
    collisions: [], textVanished: [], vanished: [], pageChanged: [], resolutionStale: []
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
  const produced = new Set();
  const monsters = kind === "monster";
  const outcomes = monsters ? monsterOutcomes(dataset, actorsFor) : [];
  const numbers = monsters ? numberOccurrences(dataset, records, book) : [];
  // A creature whose name slugs to nothing is one skip, however many features it has.
  if (monsters) {
    const names = creatures ? creatures.map((c) => c.name) : [...new Set(dataset.map((e) => e.owner))];
    report.skipped += names.filter((n) => !slug(n)).length;
  }

  for (const [index, listed] of dataset.entries()) {
    const entry = monsters ? { ...listed, occurrence: numbers[index] > 1 ? numbers[index] : undefined } : listed;
    // An entry that cannot be keyed (a feature whose owner cannot be named, a monster whose creature or feature name slugs to
    // nothing) is counted, never keyed under a guess.
    if (kind === "feature" && !entry.owner) { report.skipped += 1; continue; }
    if (monsters && !slug(entry.owner)) continue;
    if (monsters && !slug(entry.name)) { report.skipped += 1; continue; }
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
    const identity = identityIn(book, {
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
    let items = itemsFor(entry, kind, dumps, monsters ? outcomes[index] : undefined);
    let resolutions = [];
    if (existing) {
      const settled = keepSettled(existing, items, dumps, kind);
      ({ items, resolutions } = settled);
      if (settled.stale) report.resolutionStale.push(existing.key);
    }
    const official = items.find((i) => i.origin === "official" && i.match === "matched");
    if (official && !monsters) {
      const { reprints, excluded } = reprintsOf(official, dumps.reprints, existing?.items.find((i) => i.origin === "official"));
      if (reprints.length) official.reprints = reprints;
      if (excluded.length) official.reprintsExcluded = excluded;
    }
    const fresh = {
      identifier: canonicalIdentifier(items, entry.name), page: entry.page ?? null, srd: Boolean(entry.srd), text, items
    };

    let record = existing;
    if (existing) produced.add(existing.key);
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
      // A record that has a rule keeps its identifier (the rule is registered under it) and its page (a rule's page is a decision).
      if (existing.rule) {
        delete fresh.identifier;
        if (existing.page !== null && existing.page !== undefined) {
          if (fresh.page !== existing.page) report.pageChanged.push(existing.key);
          fresh.page = existing.page;
        }
      }
      Object.assign(existing, fresh);
      if (textChanged) report.textChanged.push(existing.key);
      // A verdict stands on a text that is no longer the one it was given on: dated until a new verdict is written.
      if (textChanged && existing.verdict) existing.textChangedAt = at;
      if (dataChanged) report.dataChanged.push(existing.key);
      if ((textChanged || dataChanged) && existing.evidence?.gates) delete existing.evidence.gates;
    } else {
      record = {
        key, name: entry.name, kind, book, edition: entry.edition, ...extrasOf(entry, kind), ...fresh, verdict: null,
        evidence: {}
      };
      records.push(record);
      produced.add(key);
      report.added += 1;
    }
    // Identifiers and what was settled by hand follow the items; a record with neither carries neither field.
    const sources = bindSources(record.items, record.identifier);
    for (const [field, value] of [["sources", sources], ["resolutions", resolutions]]) {
      if (Object.keys(value).length) record[field] = value;
      else delete record[field];
    }
    if (!record.page) report.noPage.push(record.key);
    if (items.some((i) => i.match === "ambiguous")) report.ambiguous.push(record.key);
    if (items.some((i) => i.match === "matched" && i.differences)) report.differing.push(record.key);
    if (!items.some((i) => i.origin === "official" && i.match === "matched")) report.noOfficial.push(record.key);
  }
  // Legacy records and the kinds that are never inventoried are not this run's to produce.
  report.vanished = records
    .filter((r) => r.book === book && r.kind === kind && r.kind !== "sense" && r.legacy !== true && !produced.has(r.key))
    .map((r) => r.key);
  return { records, report };
}
