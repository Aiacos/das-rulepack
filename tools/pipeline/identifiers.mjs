// The identifiers under which a rule reaches the items of every origin: aliases (Ruling R2), creature-scoped identifiers of
// monster features (Ruling R3), and what a source can bind. A table registered with DAS · Core is merged over the engine's own
// entries identifier by identifier, so a rule under a generic identifier ("bite", "longsword") or under one of the engine's
// identifiers would patch every item of that name: those are never aliases.
import { slug } from "./registry.mjs";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DOC_ID = /^[A-Za-z0-9]{16}$/;

// Weapons of the equipment tables: many items of every origin carry these identifiers.
const WEAPONS = [
  "club", "dagger", "greatclub", "handaxe", "javelin", "light-hammer", "mace", "quarterstaff", "sickle", "spear",
  "light-crossbow", "dart", "shortbow", "sling", "battleaxe", "flail", "glaive", "greataxe", "greatsword", "halberd", "lance",
  "longsword", "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword", "trident", "war-pick", "warhammer", "whip",
  "blowgun", "hand-crossbow", "heavy-crossbow", "longbow", "net", "musket", "pistol", "unarmed-strike"
];
// Natural weapons and stat-block features that many creatures share, and the names an importer gives an unnamed item.
const SHARED = [
  "new-item", "item", "feature", "attack", "spellcasting", "innate-spellcasting", "multiattack", "legendary-resistance",
  "legendary-actions", "bite", "claw", "claws", "slam", "tail", "gore", "hooves", "horns", "tentacle", "tentacles", "sting",
  "fist", "talons", "beak", "ram", "tusk", "touch", "weapon"
];

/** The identifiers that name many items, never registered as an alias: the empty string, importer defaults, weapons. */
export const GENERIC_IDENTIFIERS = Object.freeze(new Set(["", ...SHARED, ...WEAPONS]));

const norm = (id) => (typeof id === "string" ? id.trim().toLowerCase() : "");
const matchedOf = (record, origin) => (record?.items ?? []).find((i) => i?.origin === origin && i.match === "matched");

/** A monster feature's embedded item id (the part after "." of `<actor id>.<item id>`), or null when it is not 16 characters. */
export function embeddedIdOf(item) {
  const own = String(item?.docId ?? "").split(".").pop();
  return DOC_ID.test(own) ? own : null;
}

/**
 * Ruling R35: a monster feature's `<actor id>.<item id>` (its official item's `docId`), or null when it is not two
 * 16-character ids. The key that binds ONE creature's feature when other creatures embed the same item id.
 */
export function actorItemKeyOf(item) {
  const parts = String(item?.docId ?? "").split(".");
  return parts.length === 2 && parts.every((p) => DOC_ID.test(p)) ? parts.join(".") : null;
}

/** True for a `sources` key of two ids, `<actor id>.<item id>` (Ruling R35). */
export const isActorItemKey = (key) => typeof key === "string" && actorItemKeyOf({ docId: key }) === key;

/**
 * The keys under which a source can bind an item: the official document and its copies, or for a monster feature the
 * embedded item id (the part after "." of `<actor id>.<item id>`), and when other creatures embed that id (`embeddedShared`,
 * Ruling R35) the whole `<actor id>.<item id>` instead: a source under the bare id would bind every creature that embeds it.
 * Other origins have none (a DDB Importer id is a world's own).
 */
export function sourceKeysOf(item, kind) {
  if (item?.origin !== "official" || item.match !== "matched") return [];
  if (kind === "monster") {
    const key = item.embeddedShared ? actorItemKeyOf(item) : embeddedIdOf(item);
    return key ? [key] : [];
  }
  return [item.docId, ...(item.alsoDocIds ?? [])].filter((id) => typeof id === "string");
}

/** True when the record's `sources` bind this item to the record's identifier. */
export const boundBySource = (record, item) =>
  sourceKeysOf(item, record?.kind).some((id) => record?.sources?.[id] === record.identifier);

/**
 * True when the engine reaches the item of this origin under one of the identifiers the rule registers: the item carries the
 * record's identifier, a source binds it, or an alias of the rule is its identifier.
 */
export function reaches(record, item) {
  const own = norm(item?.identifier);
  if (own === norm(record?.identifier) || boundBySource(record, item)) return true;
  return (record?.rule?.alsoAs ?? []).some((a) => a?.origin === item?.origin && norm(a?.identifier) === own && own !== "");
}

/**
 * Why a monster feature whose embedded item id several creatures share is not reached (Rulings R3, R35): only an
 * `<actor id>.<item id>` source that binds it to the creature-scoped identifier reaches that one creature's feature.
 */
export const SHARED_EMBEDDED = "shared embedded item id: only an <actor id>.<item id> source bound to the creature-scoped"
  + " identifier reaches it";
/** Ruling R35: the engine in use refuses `<actor id>.<item id>` sources (an older DAS · Core): such a rule cannot bind. */
export const ACTOR_ITEM_REFUSED = "this DAS · Core refuses <actor id>.<item id> sources (an older engine): a rule on a"
  + " shared embedded item id waits for one that accepts them";

/**
 * What is wrong with the identifiers a ruled record registers, from the record alone (so it holds under `gates --ci`, which
 * has no dumps): its own identifier must not be generic, a monster feature's must be its creature-scoped one (R3) and a
 * shared embedded item id must be bound by its `<actor id>.<item id>` source (R35), and every alias (R2) must be a
 * non-generic identifier that the record's matched item of a named origin carries; a monster feature has none. The DAS ·
 * Core identifiers are the `unique` gate's (it has the engine). Messages start with "identifier:"; none for a record without
 * a rule.
 */
export function identifierProblems(record) {
  const rule = record?.rule;
  if (!rule || typeof rule !== "object") return [];
  const out = [];
  const own = norm(record.identifier);
  if (GENERIC_IDENTIFIERS.has(own)) out.push(`identifier: ${own || "(empty)"} is a generic identifier: a rule never registers it`);
  const monster = record.kind === "monster";
  if (monster) {
    let scoped = null;
    try { scoped = monsterIdentifier(record); } catch (e) { out.push(`identifier: ${e.message}`); }
    if (scoped && record.identifier !== scoped) {
      out.push(`identifier: a ruled monster feature is registered as ${scoped}, not ${JSON.stringify(record.identifier)}`);
    }
    const origins = Array.isArray(rule.origins) ? rule.origins : [];
    // Ruling R35: a shared embedded id is reached only through its own `<actor id>.<item id>` source.
    const shared = (record.items ?? []).some((i) => i?.match === "matched" && i.embeddedShared && origins.includes(i.origin)
      && !boundBySource(record, i));
    if (shared) out.push(`identifier: ${SHARED_EMBEDDED}`);
  }
  for (const a of Array.isArray(rule.alsoAs) ? rule.alsoAs : []) {
    const id = norm(a?.identifier);
    const shown = id || "(empty)";
    if (monster) {
      out.push(`identifier: alias ${shown}: a monster feature has no alias (DDB Importer monster features are uncovered)`);
      continue;
    }
    if (GENERIC_IDENTIFIERS.has(id)) out.push(`identifier: alias ${shown} is a generic identifier`);
    if (!(Array.isArray(rule.origins) && rule.origins.includes(a?.origin))) {
      out.push(`identifier: alias ${shown}: ${a?.origin} is not in rule.origins`);
    } else if (norm(matchedOf(record, a.origin)?.identifier) !== id) {
      out.push(`identifier: alias ${shown} is not the identifier of the matched ${a.origin} item`);
    }
  }
  return out;
}

/** The matched origins (Plutonium `unchecked` is not one) that the rule neither names nor lists as uncovered (Ruling R5). */
export function unaccountedOrigins(record) {
  const rule = record?.rule;
  if (!rule) return [];
  const named = new Set([...(Array.isArray(rule.origins) ? rule.origins : []),
    ...(Array.isArray(rule.uncovered) ? rule.uncovered.map((u) => u?.origin) : [])]);
  return [...new Set((record.items ?? []).filter((i) => i?.match === "matched").map((i) => i.origin))]
    .filter((o) => !named.has(o));
}

/**
 * Why a monster feature's DDB Importer item is never covered (Ruling R3): `rule.uncovered[].because` of that origin, which
 * `ingest --draft` adds when the drafter left it out (draft.mjs), and the reason `aliasFor` gives for it.
 */
export const DDB_MONSTER_UNCOVERED = "DDB Importer monster features: world ids and generic identifiers";

/**
 * The alias a rule needs to reach the item of `origin` (Ruling R2): `{ identifier }`, or `{ uncovered: because }` when no
 * alias may be registered (the origin goes to `rule.uncovered`), or null when the item is already reached (same identifier,
 * or bound by a source; a shared embedded id only by its `<actor id>.<item id>` source, R35). Never an alias: a monster
 * feature's item (its identifier is scoped to the creature, R3), an empty or generic identifier, a DAS · Core identifier,
 * an identifier that is not kebab-case.
 */
export function aliasFor(record, origin, { coreIdentifiers = new Set() } = {}) {
  const item = matchedOf(record, origin);
  if (!item) return { uncovered: `no matched ${origin} item` };
  if (record.kind === "monster" && origin === "ddb-importer") {
    return { uncovered: DDB_MONSTER_UNCOVERED };
  }
  if (boundBySource(record, item)) return null;
  if (item.embeddedShared) return { uncovered: SHARED_EMBEDDED };
  if (norm(item.identifier) === norm(record.identifier)) return null;
  const id = norm(item.identifier);
  if (record.kind === "monster") return { uncovered: "monster feature item not bound by a source" };
  if (GENERIC_IDENTIFIERS.has(id)) return { uncovered: `generic identifier ${JSON.stringify(id)}` };
  if (coreIdentifiers.has(id)) return { uncovered: `identifier ${id} is a DAS · Core identifier` };
  if (!KEBAB.test(id)) return { uncovered: `identifier ${JSON.stringify(id)} is not kebab-case` };
  return { identifier: id };
}

/**
 * The identifier of a ruled monster feature (Ruling R3): `<book>-<creature>-<feature>`, the repeat number appended as `-2`.
 */
export function monsterIdentifier(record) {
  const parts = [slug(record.book), slug(record.owner), slug(record.name)];
  if (parts.some((p) => !p)) throw new Error(`${record.key}: a monster identifier needs a book, a creature and a feature name`);
  const n = Number.isInteger(record.occurrence) && record.occurrence > 1 ? [String(record.occurrence)] : [];
  return [...parts, ...n].join("-");
}
