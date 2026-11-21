// Inventory: one registry record per rulebook entry, with the same item as found in each source ("origin").
import { keyOf, slug, canonical } from "./registry.mjs";
import { cacheText } from "./text.mjs";
import { identityOf, matchOrigin } from "./match.mjs";

const KIND = "spell";
const identityOfRecord = (r) => identityOf({ name: r.name, kind: r.kind, edition: r.edition });

function itemOf(origin, outcome) {
  if (outcome.match === "matched") {
    const { item } = outcome;
    return {
      origin, match: "matched", identifier: item.identifier ?? slug(item.name), docId: item.docId,
      activities: item.activities.map((a) => a.id), effects: item.effects.map((e) => e.id), data: { sha256: item.data }
    };
  }
  const candidates = outcome.candidates.map((c) => ({ identifier: c.identifier ?? slug(c.name), docId: c.docId }));
  return { origin, match: "ambiguous", candidates, differences: outcome.differences };
}

// Official first with no reference; ddb-importer is then compared against the official item when there is one.
function itemsFor(entry, dumps) {
  const subject = { name: entry.name, kind: KIND, edition: entry.edition };
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
export function inventory({ book, kind, dataset, dumps, textDir, previous }) {
  if (kind !== KIND) throw new Error(`Only kind "${KIND}" is supported, not "${kind}"`);
  const records = structuredClone(previous);
  const byIdentity = new Map(records.map((r) => [identityOfRecord(r), r]));
  const report = { added: 0, kept: 0, textChanged: [], dataChanged: [], ambiguous: [], noOfficial: [] };
  const seen = new Set();

  for (const entry of dataset) {
    const identity = identityOf({ name: entry.name, kind, edition: entry.edition });
    if (seen.has(identity)) continue;
    seen.add(identity);
    const existing = byIdentity.get(identity);

    if (existing && existing.book !== book) {
      report.kept += 1;
      const also = (existing.alsoIn ??= []);
      if (!also.some((a) => a.book === book)) also.push({ book, page: entry.page });
      continue;
    }

    const sha256 = cacheText(textDir, entry.text);
    const text = { sha256, source: "5etools", chars: entry.text.length };
    const items = itemsFor(entry, dumps);
    const fresh = { identifier: canonicalIdentifier(items, entry.name), page: entry.page, text, items };

    let record = existing;
    if (existing) {
      report.kept += 1;
      const textChanged = existing.text && existing.text.sha256 !== sha256;
      const dataChanged = dataFingerprints(existing.items) !== dataFingerprints(items);
      Object.assign(existing, fresh);
      if (textChanged) report.textChanged.push(existing.key);
      if (dataChanged) report.dataChanged.push(existing.key);
      if ((textChanged || dataChanged) && existing.evidence?.gates) delete existing.evidence.gates;
    } else {
      record = {
        key: keyOf({ book, kind, name: entry.name }), name: entry.name, kind, book, edition: entry.edition,
        ...fresh, verdict: null, evidence: {}
      };
      records.push(record);
      report.added += 1;
    }
    if (items.some((i) => i.match === "ambiguous")) report.ambiguous.push(record.key);
    if (!items.some((i) => i.origin === "official" && i.match === "matched")) report.noOfficial.push(record.key);
  }
  return { records, report };
}
