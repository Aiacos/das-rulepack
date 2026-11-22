// The registry is public: no triage `why` may share the quotation limit (8 consecutive words) with the text it comments.
// Needs the private text cache (RULEPACK_TEXT); skipped without it. A failure names keys only, never wording.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quotationCheck } from "../../tools/pipeline/gates.mjs";
import { NOT_BOOKS } from "../../tools/pipeline/registry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = join(ROOT, "registry");
const TEXT = process.env.RULEPACK_TEXT;

describe.skipIf(!TEXT || !existsSync(TEXT))("registry why strings stay under the quotation limit", () => {
  it("no record or queue entry has a why that quotes the cached text of its record", () => {
    const records = new Map();
    for (const f of readdirSync(REGISTRY).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f))) {
      for (const r of JSON.parse(readFileSync(join(REGISTRY, f), "utf8")).records) records.set(r.key, r);
    }
    const checks = new Map();
    const checkOf = (record) => {
      const sha = record?.text?.sha256;
      if (!sha || !existsSync(join(TEXT, `${sha}.txt`))) return null;
      if (!checks.has(sha)) checks.set(sha, quotationCheck(readFileSync(join(TEXT, `${sha}.txt`), "utf8")));
      return checks.get(sha);
    };
    const offenders = [];
    for (const r of records.values()) {
      const check = checkOf(r);
      if (check && typeof r.why === "string" && check(r.why)) offenders.push(`${r.key} why`);
    }
    const queue = JSON.parse(readFileSync(join(REGISTRY, "queue.json"), "utf8"));
    for (const e of queue) {
      const check = checkOf(records.get(e.key));
      if (!check) continue;
      for (const [where, why] of [["why", e.why], ["second.why", e.second?.why], ["third.why", e.third?.why]]) {
        if (typeof why === "string" && check(why)) offenders.push(`queue ${e.key} ${where}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 120_000);
});
