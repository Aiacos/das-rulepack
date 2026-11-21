// Settling a match by hand: a person picks the document of an ambiguous item (or says there is none), or excludes a reprint
// from the ids gate. Nothing here touches verdict, rule or evidence.
import { differencesOf, docTypesOf, namesItsSubclass } from "./match.mjs";
import { itemOf, bindSources, canonicalIdentifier, reprintsOf } from "./settle.mjs";
import { BY, MAX_WHY, ONE_LINE, clip } from "./triage.mjs";

export class ResolveError extends Error {}

// The origins whose items a person can settle: plutonium is never matched.
export const RESOLVABLE = Object.freeze(["official", "ddb-importer"]);
const ORIGIN_ORDER = ["official", "ddb-importer", "plutonium"];

function checkWho({ because, by }) {
  if (typeof because !== "string" || !because.trim()) throw new ResolveError("--because is required: say why in one line");
  if (because.length > MAX_WHY || !ONE_LINE.test(because)) {
    throw new ResolveError(`--because must be one line of printable characters, at most ${MAX_WHY}`);
  }
  if (typeof by !== "string" || !BY.test(by)) throw new ResolveError(`--by must match ${BY}`);
}

function checkOrigin(origin) {
  if (!RESOLVABLE.includes(origin)) throw new ResolveError(`origin must be one of ${RESOLVABLE.join(", ")}`);
}

// What the record's derived fields become once its items changed: the identifier (unless a rule is registered under it),
// and the sources the items bind.
function refresh(record, items) {
  const next = { ...record, items: items.sort((a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin)) };
  if (!record.rule) next.identifier = canonicalIdentifier(next.items, record.name);
  const sources = bindSources(next.items, next.identifier);
  if (Object.keys(sources).length) next.sources = sources;
  else delete next.sources;
  return next;
}

/**
 * Settles the `origin` item of `record`.
 * - `docId`: the item becomes `matched` to that document of `pool` (the item summaries the origin offers), which must be one of
 *   the item's listed candidates, whatever its type (inventory listed it); with `force`, any document of the pool whose type fits
 *   the kind (a feature that names its subclass may also take the subclass document). The item keeps the `differences` of the
 *   document against the entry (`reference`: the official summary, when a ddb-importer item is compared against it).
 *   `reprints` (the reprint index of the dumps, for an official item of a kind other than monster) refills the reprints.
 * - `absent`: the item is removed and the origin is recorded under `resolutions`, so inventory does not add it again; an item
 *   that was matched needs `force`, and stays removed while its document keeps its data.
 * Both record who, when and why. Throws ResolveError for anything that cannot be done.
 */
export function resolveItem(record, options) {
  const { origin, docId, absent = false, because, by = "maintainer", at, pool = [], force = false, reprints, reference } = options;
  checkOrigin(origin);
  checkWho({ because, by });
  if (Boolean(docId) === Boolean(absent)) throw new ResolveError("give exactly one of --doc and --absent");
  const items = structuredClone(record.items ?? []);
  const current = items.find((i) => i.origin === origin);
  const others = items.filter((i) => i !== current);
  const stamp = { by, at, because };
  const resolutions = (record.resolutions ?? []).filter((r) => r.origin !== origin);
  const state = current?.match ?? "absent";

  if (absent) {
    if (!current) throw new ResolveError(`${clip(record.key)} has no ${origin} item to settle`);
    if (current.match !== "ambiguous" && !force) throw new ResolveError(`the ${origin} item is ${state}, not ambiguous (--force)`);
    const was = current.match === "matched" ? { was: { docId: current.docId, sha256: current.data?.sha256 } } : {};
    const candidates = (current.candidates ?? []).map((c) => c.docId).sort();
    return refresh({ ...record, resolutions: [...resolutions, { origin, absent: true, ...stamp, candidates, ...was }] }, others);
  }

  if (current?.match !== "ambiguous" && !force) {
    throw new ResolveError(`the ${origin} item of ${clip(record.key)} is ${state}, not ambiguous (--force)`);
  }
  const listed = (current?.candidates ?? []).some((c) => c.docId === docId);
  if (!listed && !force) {
    throw new ResolveError(`${clip(docId)} is not one of the candidates of the ${origin} item (--force for another document)`);
  }
  const doc = pool.find((c) => c.docId === docId);
  if (!doc) throw new ResolveError(`${clip(docId)} is not in the ${origin} dumps`);
  const fits = [...docTypesOf(record), ...(namesItsSubclass(record) ? ["subclass"] : [])];
  if (!listed && !fits.includes(doc.type)) {
    throw new ResolveError(`${clip(docId)} is a ${doc.type} document; a ${record.kind} is one of ${fits.join(", ")}`);
  }
  const subject = { edition: record.edition, rarity: record.rarity, reference };
  const item = { ...itemOf(origin, { match: "matched", item: doc, differences: differencesOf(subject, doc) }), resolved: stamp };
  if (origin === "official" && record.kind !== "monster") {
    const { reprints: found, excluded } = reprintsOf(item, reprints, current);
    if (found.length) item.reprints = found;
    if (excluded.length) item.reprintsExcluded = excluded;
  }
  const next = refresh({ ...record, resolutions }, [...others, item]);
  if (!next.resolutions.length) delete next.resolutions;
  return next;
}

/**
 * Takes the reprint of `pkg` out of the ids gate for the official item of `record`: the item lists it under `reprintsExcluded`
 * with the reason. The package must be one the item lists under `reprints`.
 */
export function excludeReprint(record, { package: pkg, because, by = "maintainer" }) {
  checkWho({ because, by });
  const items = structuredClone(record.items ?? []);
  const official = items.find((i) => i.origin === "official" && i.match === "matched");
  if (!official) throw new ResolveError(`${clip(record.key)} has no matched official item`);
  if (!(official.reprints ?? []).some((r) => r.package === pkg)) {
    throw new ResolveError(`the official item of ${clip(record.key)} has no reprint in ${JSON.stringify(clip(pkg))}`);
  }
  official.reprintsExcluded = [...(official.reprintsExcluded ?? []).filter((x) => x.package !== pkg), { package: pkg, because }]
    .sort((a, b) => (a.package < b.package ? -1 : 1));
  return { ...record, items };
}
