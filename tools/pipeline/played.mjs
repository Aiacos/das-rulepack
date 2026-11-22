// Stage 6, played evidence (Ruling R10): `evidence.played` is read from the log of the engine's runner, never typed and never
// taken from a results file. The runner (DAS_CORE tools/scenario.mjs) prints text only: per scenario a block that opens with
// `▶ <name>`, one line per check (`✓ …` / `✗ …`), and a verdict, `✓ scénario tenu (<n> vérification(s))`, `✓ scénario tenu —
// rien vérifié …` or `✗ <n> vérification(s) en défaut`. A generated scenario (play/lib/steps.mjs) prints in its block, last
// of its own lines, the stamp line
//   das-rulepack: <scenario> core=<engine version> rule=<rule fingerprint> checks=<checks played>
// A play is recorded for a scenario only when every block of the log that names it passed with the same number of checks
// as its stamp (at least one), its stamp is exactly that line (nothing after it), names the scenario of its block, and its
// rule is both the rule its scenario file was generated for and the record's rule as it is today; and the record is in state
// reviewed (or played: played again), its scenario not manual.
//
// What this does not stop: the log is a local file. A forged log is possible; what stands against it is the honesty of
// the main session that runs the play and the owner's review of the commit that records it (as for Ruling R20).
import { ruleFingerprint, stateOf } from "./registry.mjs";
import { isCoreVersion, isScenarioId } from "./schema.mjs";
import { SCENARIO_STATES } from "./scenarios.mjs";
import { clip, echo } from "./intake.mjs";

export const STAMP = /^das-rulepack: (\S+) core=(\S+) rule=([0-9a-f]{64}) checks=(\d{1,6})$/;
const MARK = "das-rulepack:";
const START = /^▶ (.+)$/;
const PASSED = /^✓ scénario tenu \((\d+) vérifications?\)$/;
const EMPTY = /^✓ scénario tenu — rien vérifié/;
const FAILED = /^✗ (\d+) vérification\(s\) en défaut$/;
const CHECK_FAILED = /^✗ /;
// Terminal colour and cursor codes (CSI and OSC sequences): stripped from every line before it is read.
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
export const stripAnsi = (line) => line.replace(ANSI, "");

/**
 * The runner's log cut into scenario blocks: `[{ name, stamps: [{ scenario, core, rule, checks }], malformed: [line],
 * failedChecks, verdict: { passed, checks } | null }]`. Lines are read trimmed; a stamp line is one that starts with
 * `das-rulepack:` (leading spaces aside), and it is malformed unless the whole line is the stamp.
 */
export function parseRunnerLog(text) {
  const blocks = [];
  let block = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = stripAnsi(raw).trim();
    const start = START.exec(line);
    if (start) {
      block = { name: start[1], stamps: [], malformed: [], failedChecks: 0, verdict: null };
      blocks.push(block);
      continue;
    }
    if (!block || block.verdict) continue;
    if (line.startsWith(MARK)) {
      const m = STAMP.exec(line);
      if (m && isScenarioId(m[1]) && isCoreVersion(m[2])) {
        block.stamps.push({ scenario: m[1], core: m[2], rule: m[3], checks: Number(m[4]) });
      } else block.malformed.push(line);
      continue;
    }
    const passed = PASSED.exec(line);
    if (passed) block.verdict = { passed: true, checks: Number(passed[1]) };
    else if (EMPTY.test(line)) block.verdict = { passed: true, checks: 0 };
    else if (FAILED.test(line)) block.verdict = { passed: false, checks: null };
    else if (CHECK_FAILED.test(line)) block.failedChecks += 1;
  }
  return blocks;
}

// Why one block does not record a play, or null; `stamp` is its stamp when it has a well-formed one.
function blockProblem(block) {
  if (block.malformed.length) return `malformed stamp line ${echo(block.malformed[0])}: nothing may follow checks=<n>`;
  // A failed or interrupted scenario says so first (an interrupted one never reaches its stamp line).
  if (block.verdict && (!block.verdict.passed || block.failedChecks)) return "failed: a check of the runner was not met";
  if (!block.stamps.length) return "no stamp line in its block (the scenario was interrupted or is not a generated one)";
  if (block.stamps.length > 1) return "more than one stamp line in its block";
  const [stamp] = block.stamps;
  if (stamp.scenario !== block.name) return `the stamp names another scenario than its block: ${echo(stamp.scenario)}`;
  if (!block.verdict) return "the runner printed no verdict for it";
  if (!block.verdict.passed || block.failedChecks) return "failed: a check of the runner was not met";
  if (stamp.checks < 1) return "0 checks: nothing was verified";
  if (block.verdict.checks !== stamp.checks) {
    return `the runner counted ${block.verdict.checks} checks, the stamp ${stamp.checks}`;
  }
  return null;
}

/**
 * `{ records, played: [key], skipped: [{ scenario, reason }] }`: `evidence.played = { at, core, world, scenario, client,
 * rule }` written on each record whose scenario the log shows played (see the header). `scenarios`: scenario id → its
 * generated JSON (play/<book>/<slug>.json), the file the runner played. Only blocks whose name is a scenario id are read:
 * the engine's own scenarios in the same log are none of the pack's business.
 */
export function playedFrom(records, logText, { scenarios, world, client = "gm", at }) {
  const byScenario = new Map();
  for (const block of parseRunnerLog(logText)) {
    if (!isScenarioId(block.name)) continue;
    byScenario.set(block.name, [...(byScenario.get(block.name) ?? []), block]);
  }
  const byKey = new Map(records.map((r) => [r.key, r]));
  const written = new Map();
  const skipped = [];
  for (const [id, blocks] of byScenario) {
    const skip = (reason) => skipped.push({ scenario: clip(id), reason });
    const problem = blocks.map(blockProblem).find((p) => p !== null);
    if (problem) { skip(blocks.length > 1 ? `${problem} (in one of its ${blocks.length} blocks)` : problem); continue; }
    const stamp = blocks[0].stamps[0];
    if (blocks.some((b) => b.stamps[0].rule !== stamp.rule || b.stamps[0].core !== stamp.core)) {
      skip("its blocks stamp different rules or engine versions");
      continue;
    }
    const file = scenarios.get(id);
    if (!file) { skip("no record has this scenario (no scenario file play/<book>/<slug>.json)"); continue; }
    const record = byKey.get(file.key);
    if (!record || file.scenario !== id) { skip("no record has this scenario"); continue; }
    if (file.manual !== false) { skip("a manual scenario: a person records it with npm run played -- --manual"); continue; }
    const state = stateOf(record);
    if (!SCENARIO_STATES.includes(state)) { skip(`the state is ${state}, not reviewed`); continue; }
    const current = ruleFingerprint(record.rule);
    if (stamp.rule !== current) {
      skip(`the stamp is for rule ${stamp.rule.slice(0, 12)}…, not the record's current rule ${current.slice(0, 12)}…`);
      continue;
    }
    if (file.rule !== current) { skip("its scenario file was generated for another rule: run npm run scenarios"); continue; }
    if (!Number.isInteger(file.checks) || stamp.checks !== file.checks) {
      skip(`it ran ${stamp.checks} of the ${file.checks} checks its scenario declares`);
      continue;
    }
    written.set(record.key, { at, core: stamp.core, world, scenario: id, client, rule: current });
  }
  const next = records.map((r) => (written.has(r.key) ? { ...r, evidence: { ...r.evidence, played: written.get(r.key) } } : r));
  return { records: next, played: [...written.keys()].sort(), skipped };
}
