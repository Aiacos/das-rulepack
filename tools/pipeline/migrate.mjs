// One-off, kept for the record: moved the 24 hand-written rules of scripts/rules/books/*.mjs into registry/*.json.
// It reads the hand-written modules, so it can no longer run once they are generated; the registry is the source now.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { saveBook } from "./registry.mjs";
import { recordFromRule } from "./generate.mjs";

// Index of the `}` that closes the object opened at `open`, skipping string literals and comments.
function closingBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i) - 1;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces");
}

/**
 * The `//` comments of a hand-written book module, per rule: those between the end of the previous rule (or the start of the
 * `book(` call) and the end of the rule, inside the rule included. Returns `{ identifier: note | undefined }`.
 */
export function extractNotes(src, identifiers) {
  let from = src.indexOf("book(BOOK, [");
  const notes = {};
  for (const id of identifiers) {
    const at = src.indexOf(`identifier: ${JSON.stringify(id)}`, from);
    if (at < 0) throw new Error(`rule ${id} not found`);
    const end = closingBrace(src, src.lastIndexOf("{", at));
    const lines = src.slice(from, end).split("\n").flatMap((l) => {
      const m = l.match(/^\s*\/\/ ?(.*)$/) ?? l.match(/ \/\/ ([^"']*)$/);   // a whole-line comment, or one after code
      return m ? [m[1].trimEnd()] : [];
    });
    notes[id] = lines.length ? lines.join("\n") : undefined;
    from = end;
  }
  return notes;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const registry = join(root, "registry");
  const { BOOKS } = await import(pathToFileURL(join(root, "scripts/rules/index.mjs")).href);
  const legacy = [];
  for (const module of BOOKS) {
    const src = readFileSync(join(root, "scripts/rules/books", `${module.BOOK.toLowerCase()}.mjs`), "utf8");
    const notes = extractNotes(src, module.RULES.map((r) => r.identifier));
    const records = module.RULES.map((rule, i) => recordFromRule(rule, i, notes[rule.identifier]));
    saveBook(registry, { book: module.BOOK, records });
    legacy.push(...records.map((r) => r.key));
  }
  mkdirSync(registry, { recursive: true });
  writeFileSync(join(registry, "legacy.json"), `${JSON.stringify(legacy.sort(), null, 2)}\n`);
  console.log(`${legacy.length} rules migrated.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
