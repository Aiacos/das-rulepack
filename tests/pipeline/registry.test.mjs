import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  VERDICTS, STATES, ORIGINS, MATCHES, keyOf, validateRecord, ruleFingerprint, stateOf, loadBook, saveBook
} from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented spells, no real book content.
const minimal = () => ({
  key: "xphb:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "XPHB", page: 12, edition: "2024",
  text: null, items: [], verdict: null, evidence: {}
});
const rule = () => ({ handledIn: "table", adds: "Glimmer Bolt", entry: "glimmer-bolt", origins: ["official"] });
const GATES = ["schema", "validator", "ids", "fixes", "text"];
const gated = (r) => ({
  ...r, evidence: { gates: { at: "2026-11-21", core: "abc", rule: ruleFingerprint(r.rule), passed: GATES } }
});

describe("constants", () => {
  it("are exactly the specified values and frozen", () => {
    expect(VERDICTS).toEqual(["core", "data", "none", "entry", "code", "engine", "unverifiable"]);
    expect(STATES).toEqual(["inventoried", "triaged", "drafted", "gated", "reviewed", "played"]);
    expect(ORIGINS).toEqual(["official", "ddb-importer", "plutonium"]);
    expect(MATCHES).toEqual(["matched", "absent", "ambiguous", "unchecked"]);
    for (const a of [VERDICTS, STATES, ORIGINS, MATCHES]) expect(Object.isFrozen(a)).toBe(true);
  });
});

describe("keyOf", () => {
  it("slugs the name, dropping apostrophes", () => {
    const name = "Tasha's Hideous Laughter";
    expect(keyOf({ book: "XPHB", kind: "spell", name })).toBe("xphb:spell:tashas-hideous-laughter");
  });
  it("collapses other runs of non-alphanumerics and trims dashes", () => {
    expect(keyOf({ book: "PHB", kind: "spell", name: "  Acid -- Splash! " })).toBe("phb:spell:acid-splash");
  });
  it("drops typographic apostrophes too", () => {
    expect(keyOf({ book: "XPHB", kind: "spell", name: "Mage’s Spark" })).toBe("xphb:spell:mages-spark");
  });
  it("includes the creature when given", () => {
    expect(keyOf({ book: "MM", kind: "action", name: "Frost Bite", creature: "Rime Wolf" })).toBe("mm:action:rime-wolf:frost-bite");
  });
});

describe("validateRecord", () => {
  it("accepts a minimal record", () => expect(validateRecord(minimal())).toEqual([]));
  it("accepts a text fingerprint object and rejects malformed ones", () => {
    const text = { sha256: "a".repeat(64), source: "cache", chars: 0 };
    expect(validateRecord({ ...minimal(), text })).toEqual([]);
    const bads = ["plain string", { ...text, sha256: "xyz" }, { ...text, source: 1 }, { ...text, chars: -1 }, { ...text, chars: 1.5 }];
    for (const bad of bads) {
      expect(validateRecord({ ...minimal(), text: bad }).join()).toMatch(/text/);
    }
  });
  it("checks rule.handledIn and rule.adds", () => {
    const v = (r) => validateRecord({ ...minimal(), verdict: "code", rule: { ...rule(), ...r } }).join();
    expect(v({ handledIn: "code" })).toBe("");
    expect(v({ handledIn: "das-rulepack" })).toMatch(/handledIn/);
    expect(v({ adds: ["x"] })).toMatch(/adds/);
  });
  it("rejects a non-object", () => expect(validateRecord(null)).not.toEqual([]));
  it("rejects an unknown verdict", () => expect(validateRecord({ ...minimal(), verdict: "maybe" }).join()).toMatch(/verdict/));
  it("accepts every known verdict except entry-without-rule", () => {
    for (const v of VERDICTS.filter((x) => x !== "entry")) expect(validateRecord({ ...minimal(), verdict: v })).toEqual([]);
  });
  it("rejects an unknown origin in items and in rule", () => {
    const bad = { ...minimal(), items: [{ origin: "homebrew", match: "matched" }] };
    expect(validateRecord(bad).join()).toMatch(/origin/);
    const badRule = { ...minimal(), verdict: "code", rule: { ...rule(), origins: ["nope"] } };
    expect(validateRecord(badRule).join()).toMatch(/origin/);
  });
  it("rejects an unknown match in items", () => {
    const bad = { ...minimal(), items: [{ origin: "official", match: "maybe" }] };
    expect(validateRecord(bad).join()).toMatch(/match/);
  });
  it("accepts a well-formed item", () => {
    const item = {
      origin: "plutonium", match: "matched", identifier: "glimmer-bolt", docId: "abc", activities: [], effects: [], data: {}
    };
    expect(validateRecord({ ...minimal(), items: [item] })).toEqual([]);
  });
  it("requires rule.entry when the verdict is entry", () => {
    const { entry, ...noEntry } = rule();
    expect(validateRecord({ ...minimal(), verdict: "entry", rule: noEntry }).join()).toMatch(/entry/);
    expect(validateRecord({ ...minimal(), verdict: "entry" }).join()).toMatch(/entry/);
    expect(validateRecord({ ...minimal(), verdict: "entry", rule: rule() })).toEqual([]);
  });
  it("rejects page <= 0 and non-integer pages", () => {
    expect(validateRecord({ ...minimal(), page: 0 }).join()).toMatch(/page/);
    expect(validateRecord({ ...minimal(), page: -3 }).join()).toMatch(/page/);
    expect(validateRecord({ ...minimal(), page: 1.5 }).join()).toMatch(/page/);
  });
  it("rejects an edition outside 2014 | 2024", () => {
    expect(validateRecord({ ...minimal(), edition: "2025" }).join()).toMatch(/edition/);
    expect(validateRecord({ ...minimal(), edition: 2024 }).join()).toMatch(/edition/);
  });
  it("accepts the optional fields and rejects a bad legacyStatus", () => {
    const ok = {
      ...minimal(), legacy: true, legacyStatus: "played", alsoIn: [{ book: "PHB", page: 3 }], why: "x", identifier: "glimmer-bolt"
    };
    expect(validateRecord(ok)).toEqual([]);
    for (const s of ["played", "validated", "pending"]) expect(validateRecord({ ...ok, legacyStatus: s })).toEqual([]);
    expect(validateRecord({ ...ok, legacyStatus: "done" }).join()).toMatch(/legacyStatus/);
    expect(validateRecord({ ...ok, legacy: "yes" }).join()).toMatch(/legacy/);
  });
  it("reports missing required fields", () => {
    const { name, evidence, ...rest } = minimal();
    const errs = validateRecord(rest).join();
    expect(errs).toMatch(/name/);
    expect(errs).toMatch(/evidence/);
  });
});

describe("ruleFingerprint", () => {
  it("is a SHA-256 hex digest independent of key order", () => {
    const a = ruleFingerprint({ x: 1, y: { b: 2, a: [1, { d: 4, c: 3 }] } });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(ruleFingerprint({ y: { a: [1, { c: 3, d: 4 }], b: 2 }, x: 1 })).toBe(a);
  });
  it("changes with the content", () => expect(ruleFingerprint({ x: 1 })).not.toBe(ruleFingerprint({ x: 2 })));
});

describe("stateOf", () => {
  const core = "abc";
  it("walks the lifecycle", () => {
    const r = minimal();
    expect(stateOf(r, { core })).toBe("inventoried");
    expect(stateOf({ ...r, verdict: "none" }, { core })).toBe("triaged");
    const drafted = { ...r, verdict: "entry", rule: rule() };
    expect(stateOf(drafted, { core })).toBe("drafted");
    const g = gated(drafted);
    expect(stateOf(g, { core })).toBe("gated");
    const reviewed = { ...g, evidence: { ...g.evidence, reviewed: { agrees: true } } };
    expect(stateOf(reviewed, { core })).toBe("reviewed");
    const played = { ...reviewed, evidence: { ...reviewed.evidence, played: { at: "2026-11-22" } } };
    expect(stateOf(played, { core })).toBe("played");
  });
  it("needs every gate", () => {
    const g = gated({ ...minimal(), verdict: "entry", rule: rule() });
    for (const missing of GATES) {
      const passed = GATES.filter((x) => x !== missing);
      expect(stateOf({ ...g, evidence: { gates: { ...g.evidence.gates, passed } } }, { core })).toBe("drafted");
    }
  });
  it("falls back to drafted when rule.entry changes after the gates", () => {
    const g = gated({ ...minimal(), verdict: "entry", rule: rule() });
    expect(stateOf(g, { core })).toBe("gated");
    expect(stateOf({ ...g, rule: { ...g.rule, entry: "other-entry" } }, { core })).toBe("drafted");
  });
  it("does not count review or play without the gates", () => {
    const r = { ...minimal(), verdict: "entry", rule: rule(), evidence: { reviewed: { agrees: true }, played: { at: "x" } } };
    expect(stateOf(r, { core })).toBe("drafted");
  });
  it("does not count a review that disagrees", () => {
    const g = gated({ ...minimal(), verdict: "entry", rule: rule() });
    const r = { ...g, evidence: { ...g.evidence, reviewed: { agrees: false }, played: { at: "x" } } };
    expect(stateOf(r, { core })).toBe("gated");
  });
  it("ignores legacy flags and any stored state", () => {
    const r = { ...minimal(), state: "played", legacy: true, legacyStatus: "played" };
    expect(stateOf(r, { core })).toBe("inventoried");
  });
});

describe("loadBook / saveBook", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "registry-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const records = () => [
    { ...minimal(), key: "xphb:spell:zephyr-nudge", name: "Zephyr Nudge" },
    { ...minimal(), verdict: "entry", rule: rule() },
    { ...minimal(), key: "xphb:spell:ember-note", name: "Ember Note", verdict: "none" }
  ];

  it("round-trips, sorted by key, without the derived state", () => {
    saveBook(dir, { book: "XPHB", records: records() });
    const back = loadBook(dir, "XPHB");
    expect(back.book).toBe("XPHB");
    expect(back.records.map((r) => r.key)).toEqual(["xphb:spell:ember-note", "xphb:spell:glimmer-bolt", "xphb:spell:zephyr-nudge"]);
    expect(back.records.every((r) => !("state" in r))).toBe(true);
    expect(back.records.find((r) => r.name === "Glimmer Bolt").rule).toEqual(rule());
  });
  it("writes the derived state for readers and ignores a stale one on load", () => {
    saveBook(dir, { book: "XPHB", records: records() });
    const file = join(dir, "xphb.json");
    const raw = JSON.parse(readFileSync(file, "utf8"));
    expect(raw.records.map((r) => r.state)).toEqual(["triaged", "drafted", "inventoried"]);
    expect(raw.records.every((r) => !("state" in loadBook(dir, "XPHB").records[0]))).toBe(true);
  });
  it("is byte-stable, 2-space JSON with a trailing newline", () => {
    saveBook(dir, { book: "XPHB", records: records() });
    const first = readFileSync(join(dir, "xphb.json"), "utf8");
    saveBook(dir, loadBook(dir, "XPHB"));
    const second = readFileSync(join(dir, "xphb.json"), "utf8");
    expect(second).toBe(first);
    expect(first.endsWith("}\n")).toBe(true);
    expect(first).toMatch(/\n {2}"book"/);
  });
  it("refuses to save an invalid record", () => {
    expect(() => saveBook(dir, { book: "XPHB", records: [{ ...minimal(), page: 0 }] })).toThrow(/page/);
  });
});
