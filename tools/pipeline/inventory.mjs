// Inventory: one registry record per rulebook entry, with the same item as found in each source ("origin").
import { keyOf, slug, canonical, groupBy } from "./registry.mjs";
import { cacheText, textFingerprint } from "./text.mjs";
import { fittingDocTypes, identityOf, matchOrigin } from "./match.mjs";
import { KIND_TABLE } from "./kinds.mjs";
import { actorCandidates, baseFeatureName } from "./monsters.mjs";
import { itemOf, keepSettled, reprintsOf, bindSources, canonicalIdentifier } from "./settle.mjs";

export { itemOf };

// The kinds inventory can read, in the order `inventory <BOOK> all` runs them.
export const INVENTORY_KINDS = Object.freeze(
  ["spell", "feat", "option", "feature", "species", "background", "item", "monster"]
);
// A stat block is not a reprint: the identity of a monster feature includes its book.
const identityIn = (book, f) => {
  const id = identityOf(f);
  return f.kind === "monster" ? `${book}|${id}` : id;
};
// A monster feature's identity is read from its key (the part after "<book>:monster:"), which never changes: its `name` follows
// the current naming rule, its key the rule it was first written with (monsters.mjs keyFeatureName).
const identityOfRecord = (r) => (r.kind === "monster" && typeof r.key === "string"
  ? `${r.book}|${r.key.slice(`${String(r.book).toLowerCase()}:monster:`.length)}|monster|${r.edition}`
  : identityIn(r.book, {
    name: r.name, kind: r.kind, edition: r.edition, owner: r.owner, section: r.section, level: r.level, occurrence: r.occurrence
  }));
// The name a monster feature is keyed by (`keyName` when the dataset reader gives one), and the slug a record was keyed by.
const keyNameOf = (entry) => entry.keyName ?? entry.name;
const keyedSlugOf = (r) => String(r.key).split("/").pop().replace(/#\d+$/, "");

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

// A monster feature is matched against the items embedded in the actor of its creature, nowhere else. When several actors
// of the name differ in their embedded items, a feature found in any of them is ambiguous between those items.
// Only the embedded items that agree with the feature's section can be it: one that states its activation (action, bonus,
// reaction, legendary, mythic, or trait for a passive one) must state the feature's section; one that states none is neutral.
// An embedded item is compared by its name as a feature name reads (monsters.mjs baseFeatureName: "Glow (6/Year)" is "Glow"),
// since the feature's own name has its qualifiers dropped; the outcome carries the item summaries as they are.
const asFeatureNamed = (candidates) => candidates.map((c) => ({ ...c, name: baseFeatureName(c.name), summary: c }));
function unwrapped(outcome) {
  const original = (c) => c.summary ?? c;
  return {
    ...outcome,
    ...(outcome.item ? { item: original(outcome.item) } : {}),
    ...(outcome.candidates ? { candidates: outcome.candidates.map(original) } : {})
  };
}
const matchFeature = (subject, candidates) => unwrapped(matchOrigin(subject, asFeatureNamed(candidates)));

function monsterOfficial(entry, actors) {
  const subject = { name: entry.name, kind: "monster", edition: entry.edition };
  const { found, ambiguous } = actors;
  if (!found) return { match: "absent" };
  // A spellcasting block is listed as a trait whatever the activation of the item that casts, so its section is not compared.
  const agrees = (c) => entry.spellcastingBlock || !c.activations?.length || c.activations.includes(entry.section);
  const candidates = actors.candidates.filter(agrees);
  if (!ambiguous) {
    const outcome = matchFeature(subject, candidates);
    if (outcome.match !== "absent") return outcome;
    // Absent only because the section disagrees with the activation of the one same-name item: kept for the claims check.
    const only = matchFeature(subject, actors.candidates);
    return only.match === "matched" ? { match: "absent", sectionOnly: only } : outcome;
  }
  const perActor = [...groupBy(candidates, (c) => String(c.docId).split(".")[0]).values()];
  const outcomes = perActor.map((items) => matchFeature(subject, items)).filter((o) => o.match !== "absent");
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


const dataFingerprints = (items) =>
  canonical(items.filter((i) => i.match === "matched").map((i) => [i.origin, i.data]));

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
  const groupOf = ([e]) => `${e.creatureIndex ?? e.owner}|${e.section}|${slug(keyNameOf(e))}`;
  const groups = groupBy(dataset.map((e, i) => [e, i]), groupOf);
  const numbers = dataset.map((e) => e.occurrence ?? 1);
  for (const members of groups.values()) {
    const [first] = members[0];
    if (!slug(keyNameOf(first)) || !slug(first.owner)) continue;
    const existing = records
      .filter((r) => r.book === book && r.kind === "monster" && r.section === first.section
        && slug(r.owner) === slug(first.owner) && keyedSlugOf(r) === slug(keyNameOf(first)))
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
    if (monsters && !slug(keyNameOf(entry))) { report.skipped += 1; continue; }
    const keyName = monsters ? keyNameOf(entry) : entry.name;
    const key = keyOf({
      book, kind, name: keyName, owner: entry.owner, section: entry.section, level: entry.level, occurrence: entry.occurrence
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
      name: keyName, kind, edition: entry.edition, owner: entry.owner, section: entry.section, level: entry.level,
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
      const previousItem = existing?.items.find((i) => i.origin === "official");
      const types = fittingDocTypes({ kind, name: entry.name, owner: entry.owner });
      const { reprints, excluded } = reprintsOf(official, dumps.reprints, previousItem, types);
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
      // A monster feature's name follows the current naming rule (its key does not); a record that has a rule keeps its name.
      if (monsters && !existing.rule) fresh.name = entry.name;
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
