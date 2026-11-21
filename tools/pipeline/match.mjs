// Identity of a rulebook entry and matching of the items one origin offers for it.
import { slug, keyOf } from "./registry.mjs";
import { KIND_TABLE } from "./kinds.mjs";

const sortedUnique = (list) => [...new Set(list)].sort();

// What makes two entries of one book the same entry: the part of the key after the book, the kind and the edition.
// A feature of another class, a trait of another species or an item of another kind with the same name is another entry.
export function identityOf({ name, kind, edition, owner, section, level, occurrence }) {
  const key = keyOf({ book: "_", kind, name, owner, section, level, occurrence });
  return `${key.slice(`_:${slug(kind)}:`.length)}|${kind}|${edition}`;
}

const MEMO = new Map();
/**
 * A name as the matcher reads it: `{ full, base, variant }`. `full` is the slug (curly and straight apostrophes alike, a
 * leading "The" ignored); `base` is the slug without the variant marker; `variant` is the trailing parenthesised group and the
 * leading or trailing bonus token (+1, +2, +3) that tell variants of one base name apart ("" when there is none).
 */
export function matchName(name) {
  const text = String(name ?? "");
  if (MEMO.has(text)) return MEMO.get(text);
  let rest = text.replace(/[\u2018\u2019]/g, "'").trim().replace(/^the\s+/i, "");
  const full = slug(rest);
  const group = rest.match(/\s*\(([^()]*)\)\s*$/);
  if (group) rest = rest.slice(0, group.index);
  const bonus = rest.match(/^\+(\d)\s+/) ?? rest.match(/\s+\+(\d)$/);
  if (bonus) rest = rest.replace(bonus[0], " ");
  const variant = [bonus ? `+${bonus[1]}` : "", group ? slug(group[1]) : ""].filter(Boolean).join("|");
  const out = { full, base: slug(rest), variant };
  MEMO.set(text, out);
  return out;
}

export function mechanicsOf(summary) {
  const activities = summary.activities ?? [];
  return {
    level: summary.level,
    school: summary.school,
    rarity: summary.rarity,
    activityTypes: sortedUnique(activities.map((a) => a.type)),
    saves: sortedUnique(activities.flatMap((a) => a.save ?? [])),
    damageTypes: sortedUnique(activities.flatMap((a) => a.damageTypes ?? [])),
    statuses: sortedUnique((summary.effects ?? []).flatMap((e) => e.statuses ?? []))
  };
}

const FIELDS = ["level", "school", "rarity", "activityTypes", "saves", "damageTypes", "statuses"];

// Rarity as the dataset ("very rare") and the dumps ("veryRare") spell it; "none", "unknown", "varies" and a missing one
// say nothing about the item, so they are never a difference.
const rarityOf = (r) => {
  const v = String(r ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return ["", "none", "unknown", "varies"].includes(v) ? null : v;
};
export const rarityDiffers = (a, b) => rarityOf(a) !== null && rarityOf(b) !== null && rarityOf(a) !== rarityOf(b);

const differs = (f, a, b) => (f === "rarity"
  ? rarityDiffers(a.rarity, b.rarity)
  : JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null));

export const compareMechanics = (a, b) => FIELDS.filter((f) => differs(f, a, b));

// The same document met twice (a book module and an adventure that reprints it) is one candidate.
function distinct(candidates) {
  const seen = new Set();
  return candidates.filter((c) => {
    if (c.docId === undefined) return true;
    const id = `${c.docId}|${c.data}`;
    return seen.has(id) ? false : seen.add(id);
  });
}

const words = (text) => `-${slug(text)}-`;
const mentions = (text, part) => Boolean(text) && Boolean(slug(part)) && words(text).includes(words(part));

// The feat types of a document (`system.type.value`) that are what a feature or a trait is, and so say nothing against it.
const OWNED_FEAT_TYPES = { feature: ["class", "subclass"], species: ["race"] };

// How a feature or trait document stands to the owner of the entry ("Class", "Class/Subclass" or a species):
// - "agrees": a class, subclass or race document grants it, or its requirements or subtype name the owner;
// - "disagrees": the document states an owner (a grant, non-empty requirements, a subtype, or a feat type that is not a class
//   feature, e.g. general, origin, fighting style, epic boon) and none of what it states agrees;
// - "neutral": it states nothing.
// The level of a grant is deliberately not part of this: a document granted by the right owner at another level than the
// entry's is still the same feature (the dataset and the module can place it differently); the level only breaks ties.
function ownerStanding(entry, candidate) {
  const [first, second] = String(entry.owner).split("/");
  // A subclass document is nobody's grant: it belongs to the class it names (`classIdentifier`).
  if (candidate.type === "subclass") {
    if (!candidate.classIdentifier) return "neutral";
    return slug(candidate.classIdentifier) === slug(first) ? "agrees" : "disagrees";
  }
  const grants = candidate.grantedBy ?? [];
  const agreesGrant = (g) => {
    if (entry.kind === "species") return g.race !== undefined && matchName(g.race).full === matchName(first).full;
    if (g.race !== undefined || !g.class || slug(g.class) !== slug(first)) return false;
    if (!second) return g.subclass === undefined;
    return (g.subclass ?? []).some((n) => slug(n) === slug(second) || mentions(n, second) || mentions(second, n));
  };
  const named = entry.kind === "species" ? [first] : [first, ...(second ? [second] : [])];
  const names = (text) => named.some((n) => mentions(text, n));
  const type = candidate.featType;
  const wrongType = Boolean(type?.value) && !(OWNED_FEAT_TYPES[entry.kind] ?? []).includes(type.value);
  const stated = grants.length > 0 || Boolean(candidate.requirements) || Boolean(type?.subtype) || wrongType;
  const agrees = grants.some(agreesGrant) || names(candidate.requirements) || names(type?.subtype);
  if (agrees && !wrongType) return "agrees";
  return stated ? "disagrees" : "neutral";
}

// Several same-name candidates of an owned entry: the ones that agree on the owner win, then the ones that state nothing;
// the ones that disagree are dropped. `disagreed` is true when there were candidates and every one of them disagrees.
function ofOwner(entry, candidates) {
  if (!entry.owner) return { list: candidates, disagreed: false };
  const standing = candidates.map((c) => [c, ownerStanding(entry, c)]);
  const agreeing = standing.filter(([, s]) => s === "agrees");
  const kept = agreeing.length ? agreeing : standing.filter(([, s]) => s === "neutral");
  const sameLevel = kept.filter(([c]) => entry.level !== undefined && c.grantedBy?.some((g) => g.level === entry.level));
  return { list: (sameLevel.length ? sameLevel : kept).map(([c]) => c), disagreed: candidates.length > 0 && !kept.length };
}

// A feature named exactly like its subclass ("Class/Subclass", the name equal to the subclass) may be the subclass document.
export const namesItsSubclass = (entry) => {
  if (entry.kind !== "feature" || !entry.owner) return false;
  const [, subclass] = String(entry.owner).split("/");
  return Boolean(subclass) && matchName(entry.name).full === matchName(subclass).full;
};

export const docTypesOf = (entry) => {
  const row = KIND_TABLE[entry.kind];
  if (!row) return [entry.kind];
  return entry.kind === "species" && entry.owner ? row.traitDocTypes : row.docTypes;
};

// Same name: the exact slug wins; otherwise the candidates equal on the base name with the same variant marker.
// A subclass document is also known by its identifier.
const namesOf = (c) => (c.type === "subclass" && c.identifier ? [c.name, c.identifier] : [c.name]);
function sameName(entry, candidates) {
  const wanted = matchName(entry.name);
  const exact = candidates.filter((c) => namesOf(c).some((n) => matchName(n).full === wanted.full));
  if (exact.length) return exact;
  return candidates.filter((c) => {
    const n = matchName(c.name);
    return n.base === wanted.base && n.variant === wanted.variant;
  });
}

// Candidates that are one item saved under several ids (the same mechanics fingerprint, which leaves out the container, the
// quantity, the printing revision and a character's state of the item, and the same activity and effect ids) are one: the first
// docId (sorted) stands for them and the others are listed apart. A candidate with no fingerprint is never merged.
const idSet = (c) => JSON.stringify([(c.activities ?? []).map((a) => a.id).sort(), (c.effects ?? []).map((e) => e.id).sort()]);
const printOf = (c) => c.mechanics ?? c.data;
function collapse(candidates) {
  const [first, ...rest] = [...candidates].sort((a, b) => (String(a.docId) < String(b.docId) ? -1 : 1));
  const identical = printOf(first) !== undefined && rest.length > 0
    && rest.every((c) => printOf(c) === printOf(first) && idSet(c) === idSet(first));
  return identical ? { item: first, alsoDocIds: rest.map((c) => c.docId) } : null;
}

/**
 * How a chosen document differs from the entry, as a match would have recorded it: the structural differences against
 * `entry.reference` (when there is one), the rarity, and the edition (`edition-unknown` when the document does not say).
 */
export function differencesOf(entry, item) {
  const differences = entry.reference ? compareMechanics(mechanicsOf(entry.reference), mechanicsOf(item)) : [];
  if (entry.rarity !== undefined && rarityDiffers(entry.rarity, item.rarity) && !differences.includes("rarity")) {
    differences.push("rarity");
  }
  if (entry.edition && item.rules === undefined) differences.push("edition-unknown");
  else if (entry.edition && item.rules !== entry.edition) differences.push("edition");
  return differences;
}

// With a reference, the identity fields of the kind decide (level and school of a spell, rarity of an item); other differences
// come back with the match. An edition-unknown candidate (rules undefined) never forces ambiguity by itself: it is used only
// when no candidate states the entry's edition, and then mechanics decide when a reference exists.
export function matchOrigin(entry, candidates) {
  const found = matchAmong(entry, candidates, docTypesOf(entry));
  // Only when no feature document is there: the subclass document of the same name.
  if (found.match === "absent" && namesItsSubclass(entry)) return matchAmong(entry, candidates, ["subclass"]);
  return found;
}

function matchAmong(entry, candidates, types) {
  const typed = distinct(candidates).filter((c) => types.includes(c.type));
  const named = sameName(entry, typed);
  const { list: same, disagreed } = ofOwner(entry, named);
  // Same name, but every document states another owner: not a match, and not nothing either.
  if (disagreed) return { match: "ambiguous", candidates: named, differences: ["owner"] };
  if (!same.length) return { match: "absent" };

  const exact = same.filter((c) => c.rules === entry.edition);
  const preferred = exact.length ? exact : same.filter((c) => c.rules === undefined);
  if (!preferred.length) return { match: "ambiguous", candidates: same, differences: ["edition"] };
  // A monster feature is never collapsed: two embedded items of one name are two items.
  const merged = preferred.length > 1 && entry.kind !== "monster" ? collapse(preferred) : null;
  if (preferred.length > 1 && !merged) return { match: "ambiguous", candidates: preferred, differences: [] };

  const item = merged ? merged.item : preferred[0];
  const also = merged ? { alsoDocIds: merged.alsoDocIds } : {};
  const differences = entry.reference ? compareMechanics(mechanicsOf(entry.reference), mechanicsOf(item)) : [];
  if (entry.rarity !== undefined && rarityDiffers(entry.rarity, item.rarity) && !differences.includes("rarity")) {
    differences.push("rarity");
  }
  const identity = KIND_TABLE[entry.kind]?.identity ?? [];
  if (differences.some((f) => identity.includes(f))) return { match: "ambiguous", candidates: preferred, differences };
  // A candidate that does not say its edition is taken, but visibly.
  if (item.rules === undefined && entry.edition) differences.push("edition-unknown");
  return { match: "matched", item, ...(differences.length ? { differences } : {}), ...also };
}
