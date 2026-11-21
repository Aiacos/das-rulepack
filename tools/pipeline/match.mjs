// Identity of a rulebook entry and matching of the items one origin offers for it.
import { slug } from "./registry.mjs";

const sortedUnique = (list) => [...new Set(list)].sort();

export const identityOf = ({ name, kind, edition }) => `${slug(name)}|${kind}|${edition}`;

export function mechanicsOf(summary) {
  const activities = summary.activities ?? [];
  return {
    level: summary.level,
    school: summary.school,
    activityTypes: sortedUnique(activities.map((a) => a.type)),
    saves: sortedUnique(activities.flatMap((a) => a.save ?? [])),
    damageTypes: sortedUnique(activities.flatMap((a) => a.damageTypes ?? [])),
    statuses: sortedUnique((summary.effects ?? []).flatMap((e) => e.statuses ?? []))
  };
}

const FIELDS = ["level", "school", "activityTypes", "saves", "damageTypes", "statuses"];

export const compareMechanics = (a, b) =>
  FIELDS.filter((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null));

// An edition-unknown candidate (rules undefined) never forces ambiguity by itself: it is used only when no candidate
// states the entry's edition, and then mechanics decide when a reference exists.
export function matchOrigin(entry, candidates) {
  const wanted = slug(entry.name);
  const same = candidates.filter((c) => slug(c.name) === wanted && c.type === entry.kind);
  if (!same.length) return { match: "absent" };

  const exact = same.filter((c) => c.rules === entry.edition);
  const preferred = exact.length ? exact : same.filter((c) => c.rules === undefined);
  if (!preferred.length) return { match: "ambiguous", candidates: same, differences: ["edition"] };
  if (preferred.length > 1) return { match: "ambiguous", candidates: preferred, differences: [] };

  const [item] = preferred;
  const differences = entry.reference ? compareMechanics(mechanicsOf(entry.reference), mechanicsOf(item)) : [];
  return differences.length ? { match: "ambiguous", candidates: preferred, differences } : { match: "matched", item };
}
