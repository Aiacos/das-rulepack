/**
 * Every rule of the pack, from the per-book modules in ./books/, and the table registered with DAS · Core.
 *
 * Adding a book: one file in ./books/ (named after the book's code in docs/books.json, exporting BOOK and RULES), and one line
 * in the list below — a browser cannot list a folder, so the list is written out; tests/books.test.mjs fails when a file of
 * ./books/ is missing from it.
 */
import * as ai from "./books/ai.mjs";
import * as ftd from "./books/ftd.mjs";
import * as mpmm from "./books/mpmm.mjs";
import * as phb from "./books/phb.mjs";
import * as tce from "./books/tce.mjs";
import * as xge from "./books/xge.mjs";
import * as xphb from "./books/xphb.mjs";

/** The book modules, each `{ BOOK, RULES }`. */
export const BOOKS = Object.freeze([ai, ftd, mpmm, phb, tce, xge, xphb]);

/** Every rule of the pack, with its book, page, kind and status. @type {readonly import("./book.mjs").Rule[]} */
export const RULES = Object.freeze(BOOKS.flatMap(module => module.RULES));

/** The entries of the rules of one kind, by identifier. */
function entriesOf(kind) {
  return Object.freeze(Object.fromEntries(RULES.filter(rule => rule.entry && (rule.kind === kind))
    .map(rule => [rule.identifier, rule.entry])));
}

/** Declarative rules for spells, by dnd5e identifier. */
export const SPELLS = entriesOf("spell");
/** Senses, declared with the engine's generic `sense` block. */
export const SENSES = entriesOf("sense");
/** Class features where an entry of DAS · Core is completed, key by key. */
export const FEATURES = entriesOf("feature");

/** The table registered with DAS · Core: every rule that has an entry, by identifier. */
export const TABLE = Object.freeze(Object.fromEntries(RULES.filter(rule => rule.entry).map(rule => [rule.identifier, rule.entry])));
