import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { resolveItem, excludeReprint, ResolveError } from "../../tools/pipeline/resolve.mjs";
import * as settle from "../../tools/pipeline/settle.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries and invented ids.
const A = "Aa00Aa11Aa22Aa33";
const B = "Bb00Bb11Bb22Bb33";
const ACT = "Ac00Ac11Ac22Ac33";
const EFF = "Ef00Ef11Ef22Ef33";
const AT = "2026-01-01T00:00:00.000Z";

const entry = { name: "Glimmer Ring", book: "TST", page: 3, edition: "2024", srd: false, text: "t", rarity: "rare" };
const doc = (docId, over = {}) => ({
  origin: "official", docId, identifier: "glimmer-ring", name: "Glimmer Ring", type: "equipment", rules: "2024",
  activities: [{ id: ACT, type: "utility", damageTypes: [] }], effects: [{ id: EFF, name: "Glow", statuses: [] }],
  data: `h-${docId}`, ...over
});
const official = [doc(A), doc(B)];
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "res-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));
const run = (dumps, previous = []) => inventory({
  book: "TST", kind: "item", dataset: [entry], dumps: { official: [], "ddb-importer": [], ...dumps }, textDir, previous
});
const ambiguous = () => run({ official }).records[0];
const itemOf = (r, origin = "official") => r.items.find((i) => i.origin === origin);
const base = { origin: "official", because: "the first copy is the one in print", by: "reader-1", at: AT, pool: official };

describe("resolveItem", () => {
  it("turns an ambiguous item into matched, with its ids, data and who/when/why", () => {
    const record = ambiguous();
    expect(itemOf(record)).toMatchObject({ match: "ambiguous" });
    const next = resolveItem(record, { ...base, docId: B });
    expect(itemOf(next)).toEqual({
      origin: "official", match: "matched", identifier: "glimmer-ring", docId: B, activities: [ACT], effects: [EFF],
      data: { sha256: `h-${B}` }, resolved: { by: "reader-1", at: AT, because: "the first copy is the one in print" }
    });
    expect(validateRecord(next)).toEqual([]);
    expect(next.items.map((i) => i.origin)).toEqual(["official", "plutonium"]);
  });
  it("never touches verdict, rule or evidence", () => {
    const record = { ...ambiguous(), verdict: "entry", rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"] },
      evidence: { triaged: { by: "rule", at: AT } }, why: "w", identifier: "kept-id" };
    const next = resolveItem(record, { ...base, docId: A });
    expect(next).toMatchObject({ verdict: "entry", rule: record.rule, evidence: record.evidence, why: "w", identifier: "kept-id" });
    expect(next.sources).toEqual({ [A]: "kept-id" });
  });
  it("takes a document that is a candidate only; another needs --force and a document of a fitting type", () => {
    const record = ambiguous();
    const C = "Cc00Cc11Cc22Cc33";
    const pool = [...official, doc(C), doc("Dd00Dd11Dd22Dd33", { type: "spell" })];
    expect(() => resolveItem(record, { ...base, pool, docId: C })).toThrow(/not one of the candidates/);
    expect(itemOf(resolveItem(record, { ...base, pool, docId: C, force: true }))).toMatchObject({ docId: C });
    expect(() => resolveItem(record, { ...base, pool, docId: "Dd00Dd11Dd22Dd33", force: true })).toThrow(/spell document/);
    expect(() => resolveItem(record, { ...base, pool, docId: "Zz00Zz11Zz22Zz33", force: true }))
      .toThrow(/not in the official dumps/);
  });
  it("refuses a settled item without --force, a missing --because, a bad --by, a long or multiline reason", () => {
    const matched = run({ official: [doc(A)] }).records[0];
    expect(() => resolveItem(matched, { ...base, docId: A })).toThrow(ResolveError);
    const record = ambiguous();
    expect(() => resolveItem(record, { ...base, docId: A, because: undefined })).toThrow(/--because/);
    expect(() => resolveItem(record, { ...base, docId: A, because: "a\nb" })).toThrow(/one line/);
    expect(() => resolveItem(record, { ...base, docId: A, because: "x".repeat(201) })).toThrow(/at most 200/);
    expect(() => resolveItem(record, { ...base, docId: A, by: "Some Person" })).toThrow(/--by/);
    expect(() => resolveItem(record, { ...base, origin: "plutonium", docId: A })).toThrow(/origin/);
    expect(() => resolveItem(record, { ...base })).toThrow(/exactly one/);
  });
  it("removes the item for --absent and records the resolution", () => {
    const next = resolveItem(ambiguous(), { ...base, absent: true });
    expect(itemOf(next)).toBeUndefined();
    expect(next.resolutions).toEqual([{ origin: "official", absent: true, by: "reader-1", at: AT,
      because: "the first copy is the one in print", candidates: [A, B] }]);
    expect(validateRecord(next)).toEqual([]);
  });
  it("defaults by to maintainer", () => {
    const { by, ...rest } = base;
    expect(itemOf(resolveItem(ambiguous(), { ...rest, docId: A })).resolved.by).toBe("maintainer");
  });
});

describe("resolveItem: documents of any type that inventory listed, differences, forced absents", () => {
  const sub = (docId, over = {}) => ({
    origin: "official", docId, identifier: "oathbound", name: "Oathbound", type: "subclass", rules: "2024", activities: [],
    effects: [], classIdentifier: "zzfighter", data: `h-${docId}`, ...over
  });
  const featureRecord = (pool) => inventory({
    book: "TST", kind: "feature", textDir, previous: [], dumps: { official: pool, "ddb-importer": [] },
    dataset: [{ name: "Oathbound", kind: "feature", owner: "Zzfighter/Oathbound", level: 3, book: "TST", page: 5, edition: "2024",
      srd: false, text: "t" }]
  }).records[0];
  it("settles a feature to a subclass document that inventory listed", () => {
    const pool = [sub(A), sub(B)];
    const record = featureRecord(pool);
    expect(itemOf(record)).toMatchObject({ match: "ambiguous" });
    const next = resolveItem(record, { ...base, pool, docId: B });
    expect(itemOf(next)).toMatchObject({ match: "matched", docId: B });
  });
  it("limits --force to the kind's types, plus subclass for a feature that names its subclass", () => {
    const pool = [sub(A), sub(B), sub("Cc00Cc11Cc22Cc33", { type: "spell" })];
    const record = featureRecord([sub(A), sub(B)]);
    expect(() => resolveItem(record, { ...base, pool, docId: "Cc00Cc11Cc22Cc33", force: true })).toThrow(/spell document/);
    const other = { ...record, name: "Other Vow", items: [] };
    expect(() => resolveItem(other, { ...base, pool, docId: A, force: true })).toThrow(/subclass document/);
    expect(itemOf(resolveItem(record, { ...base, pool, docId: A, force: true }))).toMatchObject({ docId: A });
  });
  it("keeps the differences of the chosen document: a 2014 document for a 2024 entry is edition", () => {
    const pool = [doc(A, { rules: "2014" }), doc(B, { rules: "2014" })];
    const record = run({ official: [doc(A, { rules: "2014" }), doc(B, { rules: "2014" })] }).records[0];
    expect(itemOf(record)).toMatchObject({ match: "ambiguous", differences: ["edition"] });
    const next = resolveItem(record, { ...base, pool, docId: A });
    expect(itemOf(next)).toMatchObject({ match: "matched", differences: ["edition"] });
    const again = run({ official: pool }, [next]);
    expect(itemOf(again.records[0]).differences).toEqual(["edition"]);
    expect(again.report.differing).toEqual([next.key]);
    expect(again.report.resolutionStale).toEqual([]);
  });
  it("refuses --absent on a matched item without --force, and a forced absent sticks until the document's data changes", () => {
    const matched = run({ official: [doc(A)] }).records[0];
    expect(() => resolveItem(matched, { ...base, absent: true })).toThrow(/--force/);
    const next = resolveItem(matched, { ...base, absent: true, force: true });
    expect(validateRecord(next)).toEqual([]);
    const again = run({ official: [doc(A)] }, [next]);
    expect(itemOf(again.records[0])).toBeUndefined();
    expect(again.report.resolutionStale).toEqual([]);
    const changed = run({ official: [doc(A, { data: "h-new" })] }, [next]);
    expect(itemOf(changed.records[0])).toMatchObject({ match: "matched" });
    expect(changed.report.resolutionStale).toEqual([next.key]);
  });
  it("clips an echoed id to 80 characters", () => {
    const long = "x".repeat(300);
    expect(() => resolveItem(ambiguous(), { ...base, docId: long })).toThrow(/^(?:(?!x{81}).)*$/);
  });
  it("takes a monster's forced document only from the actors of its own creature", () => {
    const { poolOf } = settle;
    const dumps = { actors: [
      { id: "w1", name: "Wolf", items: [{ docId: "w1.a" }] }, { id: "b1", name: "Bear", items: [{ docId: "b1.a" }] }
    ] };
    expect(poolOf(dumps, "official", "monster", "Wolf").map((c) => c.docId)).toEqual(["w1.a"]);
    expect(poolOf(dumps, "official", "monster").map((c) => c.docId)).toEqual(["w1.a", "b1.a"]);
  });
});

describe("inventory keeps what was settled", () => {
  it("keeps a resolved item while the document's data fingerprint is unchanged, and loses nothing else", () => {
    const next = resolveItem(ambiguous(), { ...base, docId: B });
    const again = run({ official }, [next]);
    expect(itemOf(again.records[0])).toMatchObject({ match: "matched", docId: B, resolved: { by: "reader-1" } });
    expect(again.report.resolutionStale).toEqual([]);
    expect(again.records).toEqual([next]);
  });
  it("sends the item back to matching and lists the key when the fingerprint changed or the document is gone", () => {
    const next = resolveItem(ambiguous(), { ...base, docId: B });
    const changed = run({ official: [doc(A), doc(B, { data: "h-new" })] }, [next]);
    expect(changed.report.resolutionStale).toEqual([next.key]);
    expect(itemOf(changed.records[0])).toMatchObject({ match: "ambiguous" });
    expect(itemOf(changed.records[0]).resolved).toBeUndefined();
    const gone = run({ official: [doc(A)] }, [next]);
    expect(gone.report.resolutionStale).toEqual([next.key]);
    expect(itemOf(gone.records[0])).toMatchObject({ match: "matched", docId: A });
  });
  it("does not re-add an item settled as absent while matching offers the same candidates", () => {
    const next = resolveItem(ambiguous(), { ...base, absent: true });
    const again = run({ official }, [next]);
    expect(itemOf(again.records[0])).toBeUndefined();
    expect(again.records[0].resolutions).toEqual(next.resolutions);
    expect(again.report.resolutionStale).toEqual([]);
    expect(again.report.noOfficial).toEqual([next.key]);
  });
  it("re-adds what matching says and lists the key when the candidates changed", () => {
    const next = resolveItem(ambiguous(), { ...base, absent: true });
    const again = run({ official: [doc(A)] }, [next]);
    expect(again.report.resolutionStale).toEqual([next.key]);
    expect(itemOf(again.records[0])).toMatchObject({ match: "matched", docId: A });
    expect(again.records[0].resolutions).toBeUndefined();
  });
});

describe("excludeReprint", () => {
  const withReprint = () => {
    const reprints = new Map([[A, [{ package: "pkg-a", type: "equipment", activities: [], effects: [] }]]]);
    return run({ official: [doc(A)], reprints }).records[0];
  };
  it("lists the package under reprintsExcluded with the reason", () => {
    const next = excludeReprint(withReprint(), { package: "pkg-a", because: "older print of the same document", by: "reader-1" });
    expect(itemOf(next).reprintsExcluded).toEqual([{ package: "pkg-a", because: "older print of the same document" }]);
    expect(validateRecord(next)).toEqual([]);
  });
  it("refuses a package that is not a reprint of the item, and a missing reason", () => {
    expect(() => excludeReprint(withReprint(), { package: "other", because: "x" })).toThrow(/no reprint/);
    expect(() => excludeReprint(withReprint(), { package: "pkg-a" })).toThrow(/--because/);
  });
});

describe("pipeline CLI: resolve", () => {
  let tmp, env;
  const cli = (args, over = {}) =>
    spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env: { ...env, ...over } });
  const registry = () => JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8")).records[0];
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "res-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_REGISTRY: join(tmp, "registry") };
    mkdirSync(env.RULEPACK_DUMPS);
    const raw = (id) => ({ _id: id, name: "Glimmer Ring", type: "equipment", effects: [],
      system: { identifier: "glimmer-ring", source: { rules: "2014" }, activities: { [ACT]: { type: "utility" } }, note: id } });
    writeFileSync(join(env.RULEPACK_DUMPS, "dnd-tashas-cauldron.tcoe-magic-items.json"), JSON.stringify([raw(A), raw(B)]));
    const record = inventory({
      book: "TCE", kind: "item", dataset: [{ ...entry, book: "TCE", edition: "2014" }], textDir,
      dumps: { official: [A, B].map((id) => doc(id, { rules: "2014", data: `old-${id}` })), "ddb-importer": [] }, previous: []
    }).records[0];
    saveBook(env.RULEPACK_REGISTRY, { book: "TCE", records: [record] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("settles an ambiguous item from the dump, writes the registry and prints what it did", () => {
    const r = cli(["resolve", "tce:item:glimmer-ring", "official", "--doc", B, "--because", "the second copy is the printed one",
      "--by", "reader-2"]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ key: "tce:item:glimmer-ring", origin: "official", resolved: B });
    const item = itemOf(registry());
    expect(item).toMatchObject({ match: "matched", docId: B, activities: [ACT], resolved: { by: "reader-2" } });
    expect(item.data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(item.resolved.at).toMatch(/^\d{4}-\d\d-\d\dT/);
  });
  it("needs RULEPACK_DUMPS for --doc, a candidate docId and --because", () => {
    const args = ["resolve", "tce:item:glimmer-ring", "official", "--doc", B, "--because", "reason"];
    expect(cli(args, { RULEPACK_DUMPS: "" }).status).toBe(2);
    expect(cli(args, { RULEPACK_DUMPS: "" }).stderr).toContain("RULEPACK_DUMPS");
    expect(cli(["resolve", "tce:item:glimmer-ring", "official", "--doc", B]).status).toBe(2);
    expect(cli(["resolve", "tce:item:glimmer-ring", "official", "--doc", "Zz00Zz11Zz22Zz33", "--because", "r"]).status).toBe(2);
    expect(cli(["resolve", "tce:item:nope", "official", "--doc", B, "--because", "r"]).status).toBe(2);
    expect(cli(["resolve", "tce:item:glimmer-ring", "plutonium", "--absent", "--because", "r"]).status).toBe(2);
    expect(cli(["resolve", "tce:item:glimmer-ring", "official", "--because", "r"]).status).toBe(2);
    expect(itemOf(registry())).toMatchObject({ match: "ambiguous" });
  });
  it("settles --absent without the dumps", () => {
    const r = cli(["resolve", "tce:item:glimmer-ring", "official", "--absent", "--because", "no such item in print"],
      { RULEPACK_DUMPS: "" });
    expect(r.status, r.stderr).toBe(0);
    expect(itemOf(registry())).toBeUndefined();
    expect(registry().resolutions).toMatchObject([{ origin: "official", absent: true, by: "maintainer" }]);
  });
});
