// The `core` rule over what DAS · Core handles outside its content table (identifiers its code recognises, identifiers its
// content notes leave to the system, features whose options it handles) and the triage pre-pass that applies it to records a
// reader already took to `entry`. Synthetic fixtures only: invented features, invented texts, invented ids.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  autoTriage, choiceOptions, corePrepass, CORE_WHY, coreSourceOf, restorePrepass, triageContext
} from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { engineIdentifiers, gateUnique } from "../../tools/pipeline/gates.mjs";
import { CORE_IDENTIFIER, draftSkipReason, identifierClashReasons } from "../../tools/pipeline/batch.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma";
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "prepass-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const slugOf = (name) => name.toLowerCase().replace(/ /g, "-");
const record = (name, over = {}) => {
  const sha = cacheText(textDir, `${BODY} ${name}`);
  const kind = over.kind ?? "feature";
  return {
    key: `tst:${kind}:${slugOf(name)}`, name, kind, book: "TST", page: 3, edition: "2024", identifier: slugOf(name),
    text: { sha256: sha, source: "5etools", chars: 10 }, items: [], verdict: null, evidence: {}, ...over
  };
};
const READ = { by: "reader-tst-001", at: "2026-01-01T00:00:00.000Z", confidence: 0.9, keys: [], similar: [] };
const read = (name, over = {}) =>
  record(name, { verdict: "entry", why: "a reader's reason", evidence: { triaged: READ }, ...over });

const table = new Set(["in-table"]);
const runtime = new Map([["in-code", [{ file: "adapter/a.mjs", line: 7 }]]]);
const system = new Map([["by-system", [{ file: "content/s.mjs", line: 3 }]]]);
const sets = { coreIdentifiers: table, runtimeIdentifiers: runtime, systemHandled: system };
const tri = (r, all = [r], extra = {}) => autoTriage(r, { ...sets, textDir, ...triageContext(all), ...extra });

describe("autoTriage: the core rule over what the engine handles outside its table", () => {
  it("code and system sources give core with their own why", () => {
    expect(tri(record("In Code"))).toEqual({ verdict: "core", why: CORE_WHY.code, by: "rule" });
    expect(tri(record("By System"))).toEqual({ verdict: "core", why: CORE_WHY.system, by: "rule" });
    expect(CORE_WHY.code).toBe("DAS · Core handles this identifier in code");
    expect(CORE_WHY.system).toBe("DAS · Core leaves this identifier to the game system");
    expect(tri(record("In Table")).why).toBe(CORE_WHY.table);
    expect([CORE_WHY.table, CORE_WHY.code, CORE_WHY.system, CORE_WHY.parts].map(coreSourceOf))
      .toEqual(["table", "code", "system", "parts"]);
  });

  it("under the same conditions as the table: 2024 only, unique of its kind and edition, never a monster feature", () => {
    expect(tri(record("In Code", { edition: "2014" }))).toEqual({ hint: "core-generic" });
    const twin = record("In Code", { key: "tst:feature:in-code-2", name: "In Code" });
    expect(tri(record("In Code"), [record("In Code"), twin])).toEqual({ hint: "core-generic" });
    expect(tri(record("By System", { kind: "monster", owner: "Some Beast" }))).toEqual({ hint: "core-generic" });
    // Another kind or edition that uses it takes nothing away.
    const spell = record("In Code", { kind: "spell" });
    expect(tri(record("In Code"), [record("In Code"), spell])?.verdict).toBe("core");
  });

  it("parts: a record whose registry children (owner = its name, same book) are all core", () => {
    const parent = record("Stone Kin", { kind: "species", text: null });
    const kids = ["Kin One", "Kin Two"].map((n) => record(n, { kind: "species", owner: "Stone Kin", verdict: "core" }));
    expect(tri(parent, [parent, ...kids])).toEqual({ verdict: "core", why: CORE_WHY.parts, by: "rule" });
    expect(CORE_WHY.parts).toBe("every option of this feature is handled by DAS · Core");
    const mixed = [kids[0], { ...kids[1], verdict: "entry" }];
    expect(tri(parent, [parent, ...mixed])).toEqual({ hint: "core-parts" });
    // A child of another book, or a monster feature named after it, is not a part.
    const elsewhere = kids.map((k) => ({ ...k, book: "OTH", key: k.key.replace("tst:", "oth:") }));
    expect(tri(parent, [parent, ...elsewhere])).toBeNull();
    expect(tri({ ...parent, edition: "2014" }, [{ ...parent, edition: "2014" }, ...kids])).toEqual({ hint: "core-parts" });
  });

  it("parts: a record whose item offers a choice of options the engine all handles", () => {
    const parent = record("Many Gifts");
    const all = () => ["in-table", "in-code"];
    expect(tri(parent, [parent], { optionsOf: all })).toEqual({ verdict: "core", why: CORE_WHY.parts, by: "rule" });
    expect(tri(parent, [parent], { optionsOf: () => ["in-table", "not-handled"] })).toEqual({ hint: "core-parts" });
    expect(tri(parent, [parent], { optionsOf: () => ["in-table", null] })).toEqual({ hint: "core-parts" });
    expect(tri(parent, [parent], { optionsOf: () => [] })).toBeNull();
    expect(tri(parent, [parent], { optionsOf: () => ["nope"] })).toBeNull();
  });
});

describe("choiceOptions", () => {
  const docs = new Map([
    ["PaRent0000000001", { _id: "PaRent0000000001", system: { identifier: "many-gifts", advancement: {
      a: { type: "ItemChoice", configuration: { pool: [{ uuid: "Compendium.pkg.origins.Item.OpTion0000000001" },
        { uuid: "Compendium.pkg.origins.Item.OpTion0000000002" }, { uuid: "Compendium.pkg.origins.Item.MiSsing000000003" }] } },
      b: { type: "ItemGrant", configuration: { items: [{ uuid: "Compendium.pkg.origins.Item.GrAnt00000000004" }] } } } } }],
    ["OpTion0000000001", { _id: "OpTion0000000001", system: { identifier: "gift-one" } }],
    ["OpTion0000000002", { _id: "OpTion0000000002", system: { identifier: "gift-two" } }],
    ["PlAin00000000005", { _id: "PlAin00000000005", system: { identifier: "plain", advancement: {} } }]
  ]);
  const official = (docId, match = "matched") => ({ origin: "official", match, docId, identifier: "x" });

  it("lists the identifiers of the pool of the official item's choices, null for an option not in the dumps", () => {
    expect(choiceOptions({ items: [official("PaRent0000000001")] }, docs)).toEqual(["gift-one", "gift-two", null]);
  });

  it("is empty with no choice, no matched official item, or an item not in the dumps", () => {
    expect(choiceOptions({ items: [official("PlAin00000000005")] }, docs)).toEqual([]);
    expect(choiceOptions({ items: [official("PaRent0000000001", "ambiguous")] }, docs)).toEqual([]);
    expect(choiceOptions({ items: [{ ...official("PaRent0000000001"), origin: "ddb-importer" }] }, docs)).toEqual([]);
    expect(choiceOptions({ items: [official("NoTthere00000000")] }, docs)).toEqual([]);
  });
});

describe("corePrepass", () => {
  const AT = "2026-02-02T00:00:00.000Z";
  const run = (records, extra = {}) => corePrepass(records, { ...sets, textDir, all: records, ...extra }, { at: AT, ...extra });

  it("turns an entry a reader set to core, keeping the previous verdict, its why and its author", () => {
    const r = read("In Code");
    const out = run([r]);
    expect(out.changed).toEqual([{ key: r.key, source: "code", identifier: "in-code", was: { verdict: "entry", by: READ.by } }]);
    const [after] = out.records;
    expect(after).toMatchObject({ verdict: "core", why: CORE_WHY.code });
    expect(after.evidence.triaged)
      .toEqual({ by: "rule", at: AT, was: { verdict: "entry", why: "a reader's reason", triaged: READ } });
    expect(validateRecord(after)).toEqual([]);
    expect(r.verdict).toBe("entry");
  });

  it("takes a record without a verdict too, with no previous verdict to keep", () => {
    const out = run([record("By System")]);
    expect(out.changed.map((c) => c.source)).toEqual(["system"]);
    expect(out.records[0].evidence.triaged).toEqual({ by: "rule", at: AT });
  });

  it("never touches a ruled, legacy, queued record or one with another verdict, and leaves what the rule does not give", () => {
    const records = [
      read("In Code", { rule: { handledIn: "table", adds: "x", origins: [] } }),
      read("In Table", { legacy: true }),
      read("By System"),
      record("In Code", { kind: "item", verdict: "data", why: "w", evidence: { triaged: READ } }),
      read("Not Handled")
    ];
    const out = run(records, { queued: new Set([records[2].key]) });
    expect(out.changed).toEqual([]);
    expect(out.records).toEqual(records);
  });

  it("reports the records that get only a hint, and writes nothing for them", () => {
    const twin = read("In Code", { key: "tst:feature:in-code-2" });
    const out = run([read("In Code"), twin]);
    expect(out.changed).toEqual([]);
    expect(out.hinted.map((h) => [h.key, h.hint, h.source])).toEqual([
      ["tst:feature:in-code", "core-generic", "code"], ["tst:feature:in-code-2", "core-generic", "code"]
    ]);
  });

  it("settles a parent once its parts are turned to core in the same run", () => {
    const parent = record("Stone Kin", { kind: "species", text: null });
    const kids = [read("In Code", { kind: "species", owner: "Stone Kin" }),
      record("Kin Two", {
        kind: "species", owner: "Stone Kin", verdict: "core", why: "w", evidence: { triaged: { by: "rule", at: AT } }
      })];
    const out = run([parent, ...kids]);
    expect(out.changed.map((c) => [c.key, c.source]))
      .toEqual([["tst:species:in-code", "code"], ["tst:species:stone-kin", "parts"]]);
  });

  it("restorePrepass gives the previous verdict back", () => {
    const [after] = run([read("In Code")]).records;
    const back = restorePrepass(after);
    expect(back).toMatchObject({ verdict: "entry", why: "a reader's reason" });
    expect(back.evidence.triaged).toEqual(READ);
    expect(restorePrepass(read("Other"))).toBeNull();
  });
});

describe("the schema of evidence.triaged.was", () => {
  const base = () => ({ ...read("In Code"), verdict: "core", why: CORE_WHY.code });
  const withWas = (was, by = "rule") => ({ ...base(), evidence: { triaged: { by, at: "2026-02-02", was } } });
  it("accepts a previous verdict with its why and its triage evidence", () => {
    expect(validateRecord(withWas({ verdict: "entry", why: "w", triaged: READ }))).toEqual([]);
    expect(validateRecord(withWas({ verdict: "entry" }))).toEqual([]);
  });
  it("refuses any other shape, a was not kept by the rule, or a record that is no longer core", () => {
    const bad = [
      withWas("entry"), withWas({ verdict: "nope" }), withWas({ verdict: "core" }), withWas({ verdict: "entry", why: 3 }),
      withWas({ verdict: "entry", extra: 1 }), withWas({ verdict: "entry", triaged: { by: "rule" } }),
      withWas({ verdict: "entry", triaged: { ...READ, was: { verdict: "entry" } } }),
      withWas({ verdict: "entry" }, "reader-x"), { ...withWas({ verdict: "entry" }), verdict: "entry" }
    ];
    for (const r of bad) {
      expect(validateRecord(r).some((e) => e.includes("evidence.triaged.was")), JSON.stringify(r.evidence)).toBe(true);
    }
  });
});

// A rule under an identifier the engine handles in code, or leaves to the system, would stack on that behaviour: the unique
// gate fails it unless a person set `inCore`, and `batch draft` leaves the entry out for a person.
describe("the unique gate and batch draft hold what the engine handles outside its table", () => {
  const handledCore = { identifiers: table, runtimeIdentifiers: runtime, systemHandled: system,
    handled: new Set([...table, ...runtime.keys(), ...system.keys()]) };
  const ruled = (name, over = {}) => read(name, {
    rule: { handledIn: "table", assert: ASSERT, adds: "x", entry: { halfOnMiss: true }, origins: ["official"] }, ...over
  });

  it("fails a rule under a code or system identifier, with its own message, unless inCore", () => {
    const failures = gateUnique([ruled("In Code"), ruled("By System")], { core: handledCore });
    expect(failures).toEqual([
      "unique: tst:feature:in-code: in-code is handled by DAS · Core outside its table (in code, or left to the game system):"
        + " a rule would stack on it (set rule.inCore only on purpose)",
      "unique: tst:feature:by-system: by-system is handled by DAS · Core outside its table (in code, or left to the game"
        + " system): a rule would stack on it (set rule.inCore only on purpose)"
    ]);
    const decided = ruled("In Code");
    decided.rule.inCore = true;
    expect(gateUnique([decided], { core: handledCore })).toEqual([]);
    expect(gateUnique([ruled("In Table")], { core: handledCore })[0]).toMatch(/in-table is a DAS · Core identifier/);
    // A core without the new sets (a stand-in of older tests) holds only the table, as before.
    expect(gateUnique([ruled("In Code")], { core: { identifiers: table } })).toEqual([]);
  });

  it("leaves an entry under a code or system identifier out of draft batches", () => {
    const records = [read("In Code"), read("By System"), read("Plain")];
    // batch draft and ingest --draft pass engineIdentifiers(core): every identifier the engine handles.
    expect(engineIdentifiers(handledCore)).toBe(handledCore.handled);
    expect(engineIdentifiers({ identifiers: table })).toBe(table);
    const clashes = identifierClashReasons(records, engineIdentifiers(handledCore));
    expect(records.map((r) => draftSkipReason({ ...r, items: [{ origin: "official", match: "matched" }] }, { clashes })))
      .toEqual([CORE_IDENTIFIER, CORE_IDENTIFIER, null]);
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;

// On the command line, with the real engine: invented records named after identifiers its code recognises.
describe.skipIf(!CORE_DIR)("triage --core-prepass on the command line", () => {
  let tmp, registry, env;
  const cli = (args, over = {}) =>
    spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env: { ...env, ...over } });
  const readBook = () => JSON.parse(readFileSync(join(registry, "tst.json"), "utf8"));
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "prepass-cli-"));
    registry = join(tmp, "registry");
    env = { PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry, DAS_CORE: CORE_DIR };
    saveBook(registry, { book: "TST", records: [read("Devouring Blade"), read("Plain Thing"), read("Thirsting Blade")] });
    writeFileSync(join(registry, "queue.json"), JSON.stringify([
      { key: "tst:feature:thirsting-blade", verdict: "entry", why: "w", confidence: 0.5, by: "reader-x", reason: "low-confidence" }
    ]));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("turns what the engine handles to core, prints and reports it, and leaves queued records alone", () => {
    const report = join(tmp, "report.json");
    const r = cli(["triage", "TST", "--core-prepass", "--report", report]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/tst:feature:devouring-blade\s+code\s+adapter\/turn\.mjs:\d+/);
    expect(r.stdout).toMatch(/changed: 1/);
    const book = readBook();
    const blade = book.records.find((x) => x.key === "tst:feature:devouring-blade");
    expect(blade).toMatchObject({ verdict: "core", why: CORE_WHY.code });
    expect(blade.evidence.triaged.was).toMatchObject({ verdict: "entry", triaged: { by: READ.by } });
    expect(book.records.find((x) => x.key === "tst:feature:thirsting-blade").verdict).toBe("entry");
    const written = JSON.parse(readFileSync(report, "utf8"));
    expect(written.changed).toEqual([expect.objectContaining({
      key: "tst:feature:devouring-blade", source: "code", was: { verdict: "entry", by: READ.by },
      at: [expect.stringMatching(/^adapter\/turn\.mjs:\d+$/)]
    })]);
  });

  it("is idempotent, refuses a report inside the registry and cannot be combined with --redo-rule", () => {
    expect(cli(["triage", "TST", "--core-prepass"]).status).toBe(0);
    const once = readFileSync(join(registry, "tst.json"), "utf8");
    expect(cli(["triage", "TST", "--core-prepass"]).stdout).toMatch(/changed: 0/);
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(once);
    expect(cli(["triage", "TST", "--core-prepass", "--report", join(registry, "r.json")]).status).toBe(2);
    expect(cli(["triage", "TST", "--core-prepass", "--redo-rule"]).status).toBe(2);
    expect(cli(["triage", "TST", "--report", join(tmp, "r.json")]).status).toBe(2);
  });

  it("--redo-rule keeps a pre-pass verdict the rules still give, and gives back the previous one when they do not", () => {
    expect(cli(["triage", "TST", "--core-prepass"]).status).toBe(0);
    const before = readBook().records.find((x) => x.key === "tst:feature:devouring-blade");
    expect(cli(["triage", "TST", "--redo-rule"]).status).toBe(0);
    expect(readBook().records.find((x) => x.key === "tst:feature:devouring-blade")).toEqual(before);
    // A second record of the kind takes the identifier: the rule no longer gives core, the reader's verdict comes back.
    const book = readBook();
    const twin = read("Devouring Blade", { key: "tst:feature:devouring-blade-2" });
    saveBook(registry, { book: "TST", records: [...book.records, twin] });
    expect(cli(["triage", "TST", "--redo-rule"]).status).toBe(0);
    const back = readBook().records.find((x) => x.key === "tst:feature:devouring-blade");
    expect(back).toMatchObject({ verdict: "entry", why: "a reader's reason" });
    expect(back.evidence.triaged).toEqual(READ);
  });
});
