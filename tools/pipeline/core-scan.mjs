// A conservative static scan of a clone of DAS · Core for the identifiers it handles outside its content table: those its
// code recognises (`scanRuntime`) and those its content files leave to the game system (`scanSystemHandled`). Each found
// identifier comes with the file and line that justify it. Nothing here runs or writes the engine's code: it is read as text.
//
// Only literals in a context recognised syntactically are taken (never every kebab-case string of the code base):
// - compare     an identifier expression tested with `===` against a literal (either side), or against a constant of the
//               file or an imported one that holds a literal (`NAME`, `NAME.identifier`). An identifier expression is
//               `identifierOf(...).id`, `contentOf(...).identifier`, `<x>.system.identifier`, or a name bound to one in the
//               same top-level declaration (`const x = identifierOf(i).id`, `const { id } = identifierOf(i)`, `const
//               { identifier } = contentOf(i)`). `!==` is not taken: excluding an identifier is not handling it.
// - member      `LIST.includes(e)`, `SET.has(e)`, `TABLE[e]`, `e in TABLE`, `["a", "b"].includes(e)` for an identifier
//               expression `e`, where the list is a literal array, Set or object (its keys) of the file or imported.
// - collection  a Set or array made of the items' identifiers (`new Set(items.map(i => identifierOf(i).id))`), tested with
//               a literal, directly or through a one-line helper (`const has = x => ids.has(x)`).
// - param       a top-level function that some call passes an identifier expression as first argument: its first parameter
//               is an identifier expression inside it (compare and member then apply).
// - fact        a feature an entry's condition asks for: `"source.hasFeature": "x"`, `"target.hasFeature": "x"`,
//               `"source.hasClassFeature": { id: "x" }`.
// The content table itself (content/index.mjs) is not scanned. For the content files' notes, see scanSystemHandled.
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A word that can be a dnd5e identifier: kebab-case, at most 64 characters, and either hyphenated or letters only. */
export const isIdentifierWord = (w) => typeof w === "string" && w.length <= 64 && KEBAB.test(w)
  && (w.includes("-") || /^[a-z]+$/.test(w));

/** Every `.mjs` file under `<dir>/module/scripts`, as `{ path, source }` with `path` relative to that folder, sorted. */
export function readEngineScripts(dir) {
  const root = join(dir, "module", "scripts");
  const out = [];
  const walk = (rel) => {
    for (const d of readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(path);
      else if (d.name.endsWith(".mjs")) out.push({ path, source: readFileSync(join(root, path), "utf8") });
    }
  };
  walk("");
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Splits a source into its code with every comment blanked (same length, newlines kept) and its comments. It jumps from one
// quote or slash to the next; a slash opens a regular expression literal after an operator or an opening bracket (the last
// character before it that is not a blank or inside a comment).
function lex(source) {
  const comments = [];
  const special = /["'`/]/g;
  let lastEnd = 0;
  let last = "";
  const lastBefore = (i) => {
    for (let k = i - 1; k >= lastEnd; k--) if (!/\s/.test(source[k])) return source[k];
    return last;
  };
  let m;
  while ((m = special.exec(source))) {
    const i = m.index;
    const c = source[i];
    let end;
    if (c === "/" && source[i + 1] === "/") {
      const eol = source.indexOf("\n", i);
      end = eol < 0 ? source.length : eol;
      last = lastBefore(i);
      comments.push({ start: i, text: source.slice(i, end) });
    } else if (c === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      end = close < 0 ? source.length : close + 2;
      last = lastBefore(i);
      comments.push({ start: i, text: source.slice(i, end) });
    } else if (c !== "/") {
      let k = i + 1;
      while (k < source.length && source[k] !== c) k += source[k] === "\\" ? 2 : 1;
      end = k + 1;
      last = c;
    } else {
      const before = lastBefore(i);
      if (before !== "" && !"(,=:[!&|?{};+-*%<>~^".includes(before)) { lastEnd = i + 1; last = "/"; continue; }
      // A regular expression literal: skipped to its closing slash (outside a character class).
      let k = i + 1;
      let inClass = false;
      while (k < source.length && source[k] !== "\n" && (inClass || source[k] !== "/")) {
        if (source[k] === "\\") k += 1;
        else if (source[k] === "[") inClass = true;
        else if (source[k] === "]") inClass = false;
        k += 1;
      }
      end = k + 1;
      last = "/";
    }
    lastEnd = end;
    special.lastIndex = end;
  }
  let code = "";
  let from = 0;
  for (const c of comments) {
    code += source.slice(from, c.start) + c.text.replace(/[^\n]/g, " ");
    from = c.start + c.text.length;
  }
  return { code: code + source.slice(from), comments };
}

const lineStarts = (text) => {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
};
const lineAt = (starts, offset) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
};

// The text of a bracketed value starting at `open` (`[`, `{` or `(`), strings and nesting respected; null if unclosed.
function bracketed(code, open) {
  const pairs = { "[": "]", "{": "}", "(": ")" };
  const stack = [];
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === "\"" || c === "'" || c === "`") {
      let k = i + 1;
      while (k < code.length && code[k] !== c) k += code[k] === "\\" ? 2 : 1;
      i = k;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) {
      stack.pop();
      if (!stack.length) return code.slice(open, i + 1);
    }
  }
  return null;
}

// The pieces of a bracketed text at depth 1, split on commas.
function topLevelItems(text) {
  const inner = text.slice(1, -1);
  const items = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\"" || c === "'" || c === "`") {
      let k = i + 1;
      while (k < inner.length && inner[k] !== c) k += inner[k] === "\\" ? 2 : 1;
      i = k;
    } else if ("[{(".includes(c)) depth += 1;
    else if ("]})".includes(c)) depth -= 1;
    else if (c === "," && depth === 0) { items.push(inner.slice(from, i)); from = i + 1; }
  }
  items.push(inner.slice(from));
  return items.map((s) => s.trim()).filter(Boolean);
}

const STRING = /^"([^"\\]*)"$/;
const WRAPPERS = /^(?:Object\.freeze\(|new Set\(|\s)+/;

// What a top-level constant holds, when it is a literal: { string }, { list } (an array or Set of string literals only), or
// { keys, fields } (an object: its quoted or bare keys, and its string-valued fields).
function literalValue(code, at) {
  const rest = code.slice(at);
  const skip = rest.match(WRAPPERS)?.[0].length ?? 0;
  const start = at + skip;
  const c = code[start];
  if (c === "\"") {
    const m = code.slice(start).match(/^"([^"\\\n]*)"/);
    return m ? { string: m[1] } : null;
  }
  if (c !== "[" && c !== "{") return null;
  const text = bracketed(code, start);
  if (!text) return null;
  const items = topLevelItems(text);
  if (c === "[") {
    const strings = items.map((s) => s.match(STRING)?.[1]);
    return strings.length && strings.every((s) => s !== undefined) ? { list: strings } : null;
  }
  const keys = [];
  const fields = {};
  for (const item of items) {
    const m = item.match(/^(?:"([^"\\]+)"|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]*)$/);
    if (!m) continue;
    const key = m[1] ?? m[2];
    keys.push(key);
    const value = m[3].trim().match(STRING);
    if (value) fields[key] = value[1];
  }
  return { keys, fields };
}

const DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s/;
const CONST_AT = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*/gm;
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g;

// The parts of a file the rules need: its code, its segments (top-level declarations), its constants and its imports. Kept
// per file object: loadCore hands the same files to both scans.
const PARSED = new WeakMap();
function parse(file) {
  if (!PARSED.has(file)) PARSED.set(file, parseFile(file));
  return PARSED.get(file);
}
function parseFile(file) {
  const { code, comments } = lex(file.source);
  const starts = lineStarts(code);
  const segments = [];
  const lines = code.split("\n");
  let offset = 0;
  lines.forEach((line, i) => {
    if (DECLARATION.test(line) || i === 0) segments.push({ start: offset });
    offset += line.length + 1;
  });
  segments.forEach((s, i) => { s.end = segments[i + 1]?.start ?? code.length; s.text = code.slice(s.start, s.end); });
  const constants = new Map();
  for (const m of code.matchAll(CONST_AT)) {
    const value = literalValue(code, m.index + m[0].length);
    if (value) constants.set(m[1], value);
  }
  const imports = new Map();
  for (const m of code.matchAll(IMPORT)) {
    const from = posix.normalize(posix.join(posix.dirname(file.path), m[2]));
    for (const part of m[1].split(",").map((p) => p.trim()).filter(Boolean)) {
      const [name, local] = part.split(/\s+as\s+/);
      imports.set((local ?? name).trim(), { from, name: name.trim() });
    }
  }
  return { ...file, code, comments, starts, segments, constants, imports };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// One level of nested parentheses inside a call: identifierOf(originItemOf(e) ?? {}).
const CALL_ARGS = String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const IE = [
  String.raw`identifierOf${CALL_ARGS}\??\.id(?![\w$])`,
  String.raw`contentOf${CALL_ARGS}\??\.identifier(?![\w$])`,
  // Anchored at the start of its dotted chain: a lookbehind, so that a long chain is not tried from each of its words.
  String.raw`(?<![\w$?.])[\w$?.]*?system\??\.identifier(?![\w$])`
];
// A segment that can hold an identifier expression at all (the others are skipped: most of the code base).
const mentions = (segment) => /identifierOf\(|contentOf\(|system\??\.identifier/.test(segment.text);
const nameExpr = (name) => String.raw`(?<![\w$.])${esc(name)}(?![\w$])`;
const LIT = String.raw`"([^"\\\n]*)"`;
// A JavaScript name.
const N = String.raw`[A-Za-z_$][\w$]*`;

// The names bound to an identifier expression in a segment.
function boundNames(text, seed = []) {
  const names = new Set(seed);
  for (const [call, field] of [["identifierOf", "id"], ["contentOf", "identifier"]]) {
    const re = new RegExp(String.raw`(?:const|let)\s*\{([^}]*)\}\s*=\s*${call}\(`, "g");
    for (const m of text.matchAll(re)) {
      for (const part of m[1].split(",").map((p) => p.trim())) {
        const [key, local] = part.split(/\s*:\s*/);
        if (key === field) names.add((local ?? key).replace(/\s*=.*$/, ""));
      }
    }
  }
  // Then the names bound to those: `const own = identifier ?? "";`.
  let grew = true;
  while (grew) {
    grew = false;
    const exprs = [...IE, ...[...names].map(nameExpr)].join("|");
    const direct = new RegExp(String.raw`(?:const|let)\s+(${N})\s*=\s*(?:${exprs})\s*(?:\?\?\s*(?:""|null)\s*)?[;\n)]`, "g");
    for (const m of text.matchAll(direct)) if (!names.has(m[1])) { names.add(m[1]); grew = true; }
  }
  return names;
}

/**
 * The identifiers the engine's code recognises outside its content table (see the rules at the top of this file): a Map of
 * identifier to `[{ file, line, rule }]`, `file` relative to module/scripts. `files` are `{ path, source }`.
 */
export function scanRuntime(files) {
  const parsed = files.filter((f) => f.path !== "content/index.mjs" && !isToolingFile(f.path)).map(parse);
  const byPath = new Map(parsed.map((p) => [p.path, p]));
  const found = new Map();
  const add = (id, file, offset, rule) => {
    if (!isIdentifierWord(id)) return;
    const at = { file: file.path, line: lineAt(file.starts, offset), rule };
    const list = found.get(id) ?? [];
    if (!list.some((a) => a.file === at.file && a.line === at.line)) list.push(at);
    found.set(id, list);
  };
  const constantOf = (file, name) => {
    if (file.constants.has(name)) return file.constants.get(name);
    const imported = file.imports.get(name);
    return imported ? byPath.get(imported.from)?.constants.get(imported.name) ?? null : null;
  };

  // compare and member over one segment, with `names` bound to identifier expressions.
  const scanSegment = (file, segment, names, labels) => {
    const exprs = [...IE, ...[...names].map(nameExpr)].join("|");
    const text = segment.text;
    const at = (m) => segment.start + m.index;
    // `typeof x === "string"` tests a type, not an identifier (checked after the match: a lookbehind of variable length
    // would rescan every run of blanks).
    for (const m of text.matchAll(new RegExp(String.raw`(?:${exprs})\s*===\s*${LIT}`, "g"))) {
      if (!/typeof\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index))) add(m[1], file, at(m), labels.compare);
    }
    for (const m of text.matchAll(new RegExp(String.raw`${LIT}\s*===\s*(?:${exprs})`, "g"))) add(m[1], file, at(m), labels.compare);
    const constant = new RegExp(String.raw`(?:${exprs})\s*===\s*([A-Z][A-Z0-9_]*)(\.identifier)?(?![\w$])`, "g");
    for (const m of text.matchAll(constant)) {
      const value = constantOf(file, m[1]);
      const id = m[2] ? value?.fields?.identifier : value?.string;
      if (id) add(id, file, at(m), labels.compare);
    }
    const member = [
      new RegExp(String.raw`(?<![\w$.])([A-Za-z_$][\w$]*)\??\.(?:includes|has)\(\s*(?:${exprs})\s*\)`, "g"),
      new RegExp(String.raw`(?<![\w$.])([A-Za-z_$][\w$]*)\??\.?\[\s*(?:${exprs})\s*\]`, "g"),
      new RegExp(String.raw`(?:${exprs})\s+in\s+([A-Za-z_$][\w$]*)(?![\w$.(])`, "g")
    ];
    for (const re of member) {
      for (const m of text.matchAll(re)) {
        const value = constantOf(file, m[1]);
        for (const id of value?.list ?? value?.keys ?? []) add(id, file, at(m), labels.member);
      }
    }
    // One way only to split the list (no optional comma between optional spaces): no backtracking on a long array.
    const strings = String.raw`\s*"[^"\\\n]*"(?:\s*,\s*"[^"\\\n]*")*`;
    const inline = new RegExp(String.raw`\[(${strings})\s*,?\s*\]\.(?:includes|has)\(\s*(?:${exprs})\s*\)`, "g");
    for (const m of text.matchAll(inline)) for (const s of m[1].matchAll(/"([^"\\\n]*)"/g)) add(s[1], file, at(m), labels.member);
  };

  // param: which functions some call passes an identifier expression to, by the file that defines them.
  const calledWith = new Map();
  const callRe = new RegExp(String.raw`(?<![\w$.])([A-Za-z_$][\w$]*)\(\s*(?:${IE.join("|")})\s*[,)]`, "g");
  for (const file of parsed) {
    for (const segment of file.segments.filter(mentions)) {
      const names = boundNames(segment.text);
      const exprs = [...IE, ...[...names].map(nameExpr)].join("|");
      const re = names.size ? new RegExp(String.raw`(?<![\w$.])([A-Za-z_$][\w$]*)\(\s*(?:${exprs})\s*[,)]`, "g") : callRe;
      for (const m of segment.text.matchAll(re)) {
        const target = file.imports.get(m[1])?.from ?? file.path;
        const name = file.imports.get(m[1])?.name ?? m[1];
        calledWith.set(`${target}|${name}`, true);
      }
    }
  }
  // `function f(p` or `const f = (p, ...) =>` / `const f = p =>`, at the start of a segment: f and its first parameter p.
  const DEFINES = new RegExp(String.raw`^(?:export\s+)?(?:async\s+)?(?:function\s+(${N})\s*\(\s*(${N})`
    + String.raw`|const\s+(${N})\s*=\s*(?:async\s+)?\(?\s*(${N})\s*(?:=[^,)]*)?[,)]?\s*=>)`);

  for (const file of parsed) {
    for (const segment of file.segments) {
      const def = segment.text.match(DEFINES);
      const fn = def?.[1] ?? def?.[3];
      const param = def?.[2] ?? def?.[4];
      if (fn && param && calledWith.has(`${file.path}|${fn}`)) {
        scanSegment(file, segment, boundNames(segment.text, [param]), { compare: "param", member: "param" });
      }
      if (!mentions(segment)) continue;
      scanSegment(file, segment, boundNames(segment.text), { compare: "compare", member: "member" });
      // collection: a Set or array of the items' identifiers, and its one-line helpers.
      const collectionRe = new RegExp(String.raw`(?:const|let)\s+(${N})\s*=\s*(?:new Set\()?[^;\n]*\.map\(\s*\(?\s*${N}\s*\)?`
        + String.raw`\s*=>\s*(?:${IE.join("|")})`, "g");
      for (const c of segment.text.matchAll(collectionRe)) {
        const callers = [c[1]];
        const helper = new RegExp(String.raw`(?:const|let)\s+(${N})\s*=\s*\(?\s*(${N})\s*\)?\s*=>\s*${esc(c[1])}`
          + String.raw`\.(?:has|includes)\(\s*\2\s*\)`, "g");
        for (const h of segment.text.matchAll(helper)) callers.push(h[1]);
        const direct = new RegExp(String.raw`(?<![\w$.])${esc(c[1])}\.(?:has|includes)\(\s*${LIT}\s*\)`, "g");
        for (const m of segment.text.matchAll(direct)) add(m[1], file, segment.start + m.index, "collection");
        for (const name of callers.slice(1)) {
          for (const m of segment.text.matchAll(new RegExp(String.raw`(?<![\w$.])${esc(name)}\(\s*${LIT}\s*\)`, "g"))) {
            add(m[1], file, segment.start + m.index, "collection");
          }
        }
      }
    }
    // fact: what an entry's condition asks for.
    const fact = new RegExp(String.raw`"(?:source|target)\.hasFeature"\s*:\s*${LIT}`, "g");
    for (const m of file.code.matchAll(fact)) add(m[1], file, m.index, "fact");
    const classFact = new RegExp(String.raw`"(?:source|target)\.hasClassFeature"\s*:\s*\{\s*id\s*:\s*${LIT}`, "g");
    for (const m of file.code.matchAll(classFact)) add(m[1], file, m.index, "fact");
  }
  return sortFound(found);
}

// The engine's own diagnostics, debug trail and test scenarios name identifiers to clean or set up, not to play them.
const isToolingFile = (path) => path.includes("/diagnostic/") || /(^|\/)(testing[\w-]*|debug)\.mjs$/.test(path);

const sortFound = (found) => new Map([...found].sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([id, list]) => [id, list.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))]));

// The phrases by which a content note says the system does something itself, or that it needs no entry.
const SYSTEM_SAYS = /aucune entrée|\b(?:fait|font|calcule|tient|applique|joue)\s+(?:déjà\s+)?(?:tout\s+)?seuls?\b/i;
const NAMES_SYSTEM = /\bdnd5e\b|\bsystème\b/i;

/**
 * The identifiers the engine's content files (content/, not content/index.mjs) leave to the game system: a Map of
 * identifier to `[{ file, line, rule }]`.
 * - note    a sentence of a comment that names dnd5e (or the system) and says it does the thing itself or that no entry is
 *           needed ("... fait seul", "aucune entrée"), and names the identifier in backticks (a hyphenated one only: a
 *           backticked single word in such a sentence is a data key as often as an identifier).
 * - list    a top-level literal list of identifiers whose comment, just above it, says so.
 * - marker  an entry whose value is `null` or `{}` (nothing to do), under a hyphenated identifier.
 */
export function scanSystemHandled(files) {
  const found = new Map();
  const add = (id, file, line, rule) => {
    if (!isIdentifierWord(id)) return;
    const list = found.get(id) ?? [];
    if (!list.some((a) => a.file === file.path && a.line === line)) list.push({ file: file.path, line, rule });
    found.set(id, list);
  };
  for (const raw of files.filter((f) => f.path.startsWith("content/") && f.path !== "content/index.mjs")) {
    const file = parse(raw);
    for (const comment of file.comments) {
      const sentences = comment.text.split(/(?<=[.;])[\s*]+(?=[A-ZÀ-ÝŒ§«`(]|$)/);
      let offset = comment.start;
      for (const sentence of sentences) {
        const from = file.source.indexOf(sentence, offset);
        const base = from < 0 ? offset : from;
        if (SYSTEM_SAYS.test(sentence.replace(/\s*\n\s*\*?\s*/g, " ")) && NAMES_SYSTEM.test(sentence)) {
          for (const m of sentence.matchAll(/`([^`\n]+)`/g)) {
            if (m[1].includes("-")) add(m[1], file, lineAt(file.starts, base + m.index), "note");
          }
        }
        offset = base + sentence.length;
      }
    }
    // list: a literal list right under a comment that says the system handles it.
    for (const m of file.code.matchAll(CONST_AT)) {
      const value = literalValue(file.code, m.index + m[0].length);
      if (!value?.list) continue;
      const line = lineAt(file.starts, m.index);
      const above = file.comments.find((c) => lineAt(file.starts, c.start + c.text.length) === line - 1);
      if (above && SYSTEM_SAYS.test(above.text) && NAMES_SYSTEM.test(above.text)) {
        for (const id of value.list) add(id, file, line, "list");
      }
    }
    const marker = /"([^"\\\n]*-[^"\\\n]*)"\s*:\s*(?:null|\{\s*\})\s*(?=[,}\n])/g;
    for (const m of file.code.matchAll(marker)) add(m[1], file, lineAt(file.starts, m.index), "marker");
  }
  return sortFound(found);
}

/**
 * Where the engine says it handles an identifier, as `file:line` strings for a report: the lines of `runtime` and `system`
 * (scanRuntime, scanSystemHandled) when it is there, else the first line of a content file that names it in quotes (its
 * entry, or the list that gives it one). Empty when no line names it.
 */
export function locator(files, runtime, system) {
  const content = files.filter((f) => f.path.startsWith("content/"));
  return (id) => {
    const listed = [...(runtime.get(id) ?? []), ...(system.get(id) ?? [])];
    if (listed.length) return listed.map((a) => `${a.file}:${a.line}`);
    for (const f of content) {
      const at = f.source.split("\n").findIndex((l) => l.includes(`"${id}"`));
      if (at >= 0) return [`${f.path}:${at + 1}`];
    }
    return [];
  };
}
