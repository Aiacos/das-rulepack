import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadBook, saveBook } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: an invented spell in an invented book.
const NOTE = "Test Book (2030).\n\nA book-level comment that survives every load and save.";
let tmp, env;
const write = (rel, data) => {
  const file = join(tmp, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
};
const read = () => JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8"));
const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
const setNote = () => {
  const file = read();
  writeFileSync(join(tmp, "registry", "tce.json"), JSON.stringify({ book: file.book, note: NOTE, records: file.records }));
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "note-"));
  env = {
    PATH: process.env.PATH, RULEPACK_DATASET: join(tmp, "data"), RULEPACK_DUMPS: join(tmp, "dumps"),
    RULEPACK_TEXT: join(tmp, "text"), RULEPACK_REGISTRY: join(tmp, "registry"), DAS_CORE: process.env.DAS_CORE ?? ""
  };
  for (const code of ["tce", "xge"]) {
    write(`data/spells/spells-${code}.json`, {
      spell: [{ name: "Glimmer Bolt", page: code === "tce" ? 10 : 44, level: 2, school: "V", entries: ["Invented light."] }]
    });
  }
  write("dumps/dnd-tashas-cauldron.spells.json", [{
    _id: "doc1", name: "Glimmer Bolt", type: "spell",
    system: { identifier: "glimmer-bolt", source: { rules: "2014" }, level: 2, school: "evo", activities: {} }
  }]);
  mkdirSync(join(tmp, "text"), { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("the book-level note", () => {
  it("loadBook returns it and saveBook writes it after `book`, before `records`; no note, no key", () => {
    const dir = join(tmp, "r");
    const record = { key: "tce:spell:a", name: "A", kind: "spell", book: "TCE", page: 1, edition: "2014", text: null, items: [],
      verdict: null, evidence: {} };
    saveBook(dir, { book: "TCE", note: NOTE, records: [record] });
    expect(Object.keys(JSON.parse(readFileSync(join(dir, "tce.json"), "utf8")))).toEqual(["book", "note", "records"]);
    expect(loadBook(dir, "TCE").note).toBe(NOTE);
    saveBook(dir, { book: "TCE", records: [record] });
    expect(Object.keys(loadBook(dir, "TCE"))).toEqual(["book", "records"]);
  });

  it("an inventory run that rewrites the book keeps it", () => {
    expect(cli(["inventory", "TCE", "spell"]).status).toBe(0);
    setNote();
    const r = cli(["inventory", "XGE", "spell"]);
    expect(r.status).toBe(0);
    expect(read().records[0].alsoIn).toEqual([{ book: "XGE", page: 44 }]);
    expect(read().note).toBe(NOTE);
  });

  it.skipIf(!process.env.DAS_CORE)("a gates run that rewrites the book keeps it", () => {
    expect(cli(["inventory", "TCE", "spell"]).status).toBe(0);
    const file = read();
    file.records[0].verdict = "entry";
    file.records[0].rule = { handledIn: "table", adds: "Nothing.", entry: { triggers: [] }, origins: ["official"] };
    writeFileSync(join(tmp, "registry", "tce.json"), JSON.stringify({ ...file, note: NOTE }));
    cli(["gates"]);
    const after = read();
    expect(after.records[0].evidence.gates).toBeTruthy();   // the run did rewrite the file
    expect(after.note).toBe(NOTE);
  });
});
