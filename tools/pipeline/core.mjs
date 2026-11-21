// Loads what the gates need from a clone of DAS · Core: the validator, the data-fix helpers, the fact names and the table of
// identifiers the engine already has an entry for. Nothing here writes to the clone.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const MIN_FACTS = 60;

const FACT_KEY = /^\s+"([A-Za-z]+\.[A-Za-z]+)"\s*:/gm;

/**
 * The fact names of `adapter/facts.mjs`. The file needs Foundry globals, so it is read as text: the keys of the object that
 * `factsFor` returns, one per line (comments that quote a key are not on a line of their own).
 */
export function factNames(source) {
  const start = source.indexOf("export function factsFor");
  if (start < 0) throw new Error("adapter/facts.mjs: factsFor was not found");
  return [...new Set([...source.slice(start).matchAll(FACT_KEY)].map((m) => m[1]))];
}

const load = (dir, path) => import(pathToFileURL(join(dir, "module", "scripts", path)).href);

export async function loadCore(dir) {
  const files = ["core/content.mjs", "core/data-fixes.mjs", "content/index.mjs", "adapter/facts.mjs", "../module.json"];
  for (const f of files) {
    if (!existsSync(join(dir, "module", "scripts", f))) throw new Error(`DAS_CORE ${dir}: module/scripts/${f} is missing`);
  }
  const { validateEntry } = await load(dir, "core/content.mjs");
  const { matchesFrom, getPath } = await load(dir, "core/data-fixes.mjs");
  const { SHIPPED, SRD_ALIASES } = await load(dir, "content/index.mjs");
  if (typeof validateEntry !== "function" || typeof matchesFrom !== "function" || typeof getPath !== "function") {
    throw new Error(`DAS_CORE ${dir}: validateEntry, matchesFrom or getPath is not exported`);
  }
  if (!SHIPPED || typeof SHIPPED !== "object") throw new Error(`DAS_CORE ${dir}: content/index.mjs does not export SHIPPED`);

  const facts = factNames(readFileSync(join(dir, "module", "scripts", "adapter", "facts.mjs"), "utf8"));
  if (facts.length < MIN_FACTS) {
    throw new Error(`DAS_CORE ${dir}: only ${facts.length} facts found, expected at least ${MIN_FACTS}`);
  }

  const { version } = JSON.parse(readFileSync(join(dir, "module", "module.json"), "utf8"));
  if (typeof version !== "string" || !version) {
    throw new Error(`DAS_CORE ${dir}: module.json has no version`);
  }

  const aliases = SRD_ALIASES ?? {};
  const identifiers = new Set([...Object.keys(SHIPPED), ...Object.keys(aliases), ...Object.values(aliases)]);
  return { validateEntry, facts, matchesFrom, getPath, version, identifiers };
}
