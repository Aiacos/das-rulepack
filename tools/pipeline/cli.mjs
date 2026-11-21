// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, loadBook, saveBook } from "./registry.mjs";
import { readSpells } from "./dataset.mjs";
import { dumpsFor, itemSummary, readDump } from "./dumps.mjs";
import { inventory } from "./inventory.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = join(ROOT, "registry");

class UsageError extends Error {}

const need = (name) => {
  if (!process.env[name]) throw new UsageError(`Environment variable ${name} is not set`);
  return process.env[name];
};

function loadRegistry(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ file: f, ...loadBook(dir, f.slice(0, -5)) }));
}

function loadDumps(dir) {
  const read = (origin) => dumpsFor(dir, origin).flatMap((f) => readDump(join(dir, f)).map((d) => itemSummary(d, origin)));
  return { official: read("official"), "ddb-importer": read("ddb-importer") };
}

function inventoryCommand([book, kind]) {
  if (!book || !kind) throw new UsageError("Usage: inventory <BOOK> <kind>");
  if (kind !== "spell") throw new UsageError(`Kind "${kind}" is not supported yet: only "spell" is`);
  const datasetDir = need("RULEPACK_DATASET");
  const dumpsDir = need("RULEPACK_DUMPS");
  const textDir = need("RULEPACK_TEXT");

  const books = loadRegistry(REGISTRY);
  const previous = books.flatMap((b) => b.records);
  const { records, report } = inventory({
    book, kind, dataset: readSpells(datasetDir, book), dumps: loadDumps(dumpsDir), textDir, previous
  });

  const touched = new Set();
  const before = new Map(previous.map((r) => [r.key, canonical(r)]));
  for (const r of records) if (before.get(r.key) !== canonical(r)) touched.add(r.book);
  for (const code of touched) {
    saveBook(REGISTRY, { book: code, records: records.filter((r) => r.book === code) });
  }
  console.log(JSON.stringify(report, null, 2));
}

export const COMMANDS = { inventory: inventoryCommand };

export function main(argv) {
  const [name, ...args] = argv;
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
  try {
    if (!command) throw new UsageError(`Usage: pipeline <${Object.keys(COMMANDS).join("|")}> ...`);
    command(args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
