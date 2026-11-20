/**
 * Acquisitions Incorporated (2019).
 *
 * The effect ids are those of the items imported by DDB Importer; an item from another source keeps the general rules of the
 * engine, and the parts of a rule that name an id do nothing on it.
 */
import { book } from "../book.mjs";

export const BOOK = "AI";

export const RULES = book(BOOK, [
  {
    identifier: "incite-greed", name: "Incite Greed", page: 76, kind: "spell", status: "validated", handledIn: "table",
    adds: "A charmed target repeats the save at the end of each of its turns.",
    // Incite Greed (AI p.76): the effect lets its bearer repeat the save at the end of each of its turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "4Hi47QCDFVz6m9gd", do: [{ type: "resave" }] }] }
  }
]);
