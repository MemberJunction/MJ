#!/usr/bin/env node
/**
 * DOM-test visibility report.
 *
 * For every Angular component in scope, scores how well it's DOM-tested — NOT just "does a
 * spec file exist." For each component it reports:
 *   - status: solid / partial / stub / none  (skipped/deferred still counts as a gap, annotated)
 *   - tests:  how many `it(...)` the spec has
 *   - outputs: how many of the component's @Outputs the spec actually references
 *   - used:   how many places render the component (its selector usage across templates) — the
 *             "how much it matters" signal, so heavily-used gaps rank to the top
 *
 * The component "surface" (inputs/outputs/gating/events) comes from the SAME parser the stub
 * generator uses (scripts/lib/component-surface.mjs), so the report scores against exactly what
 * a generated stub would have asked you to cover.
 *
 * Usage:
 *   node scripts/dom-test-report.mjs [scopePath] [--json] [--all] [--top=N]
 *     scopePath  subtree to scan (default: packages/Angular/Generic)
 *     --json     machine-readable output
 *     --all      list every component, not just the gaps
 *     --top=N    cap the printed gap list (default 40)
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { parseComponentSurface } from "./lib/component-surface.mjs";

const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const showAll = args.includes("--all");
const topN = Number((args.find((a) => a.startsWith("--top=")) || "--top=40").split("=")[1]) || 40;
const scope = args.find((a) => !a.startsWith("--")) || "packages/Angular/Generic";
const scanRoot = join(repoRoot, scope);

// Known deferrals — still reported as gaps (per decision), but annotated with WHY so the team
// can see it's an intentional skip, not an oversight.
const DEFERRALS = [
  [/\/livekit-room\//, "media/WebRTC → e2e"],
  [/\/mj-livekit-room\//, "media → e2e"],
  [/\/filter-builder\//, "component-side NG0100"],
];
const deferralReason = (rel) => (DEFERRALS.find(([re]) => re.test(rel)) || [])[1] || "";

// --- walk for *.component.ts (skip specs / node_modules / dist) ---
function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".component.ts")) acc.push(p);
  }
  return acc;
}

// --- usage corpus: all template-bearing files, to count how often a selector is rendered ---
function buildCorpus(dir, parts = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return parts;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) buildCorpus(p, parts);
    else if (e.name.endsWith(".html") || e.name.endsWith(".ts")) {
      try {
        parts.push(readFileSync(p, "utf-8"));
      } catch {
        /* ignore unreadable */
      }
    }
  }
  return parts;
}
const corpus = buildCorpus(join(repoRoot, "packages/Angular")).join("\n");
const usageOf = (selector) => (selector ? corpus.split(`<${selector}`).length - 1 : 0);
const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- score one component ---
function scoreComponent(file) {
  const s = parseComponentSurface(file);
  if (s.className === "TheComponent" && !s.selector) return null; // not an @Component file
  const rel = relative(repoRoot, file);
  const specPath = file.replace(/\.component\.ts$/, ".component.dom.test.ts");
  const hasSpec = existsSync(specPath);
  const spec = hasSpec ? readFileSync(specPath, "utf-8") : "";

  const testCount = (spec.match(/\bit\s*(?:\.\w+)?\s*\(/g) || []).length;
  const hasTodos = /^\s*\/\/\s*TODO:/m.test(spec);
  const onlyRenders = testCount <= 1 && /toBeTruthy\(\)/.test(spec);

  // Behavior coverage: the *named* bits of a component's contract that a real assertion would
  // reference by name — @Output names, [class.X] names, [attr.X] names. A spec that mentions the
  // token (e.g. `.ToggleMicrophone.subscribe(` or `.classList.contains('badge-high')`) "covers" it.
  // Gating @if-conditions and {{ }} interpolations are intentionally NOT counted: a spec asserts
  // the rendered element/text, not the source expression, so they can't be matched by name.
  const targets = [...new Set([...s.outputs, ...s.behaviors.conditionalClasses.map((c) => c.cls), ...s.behaviors.attrs.map((a) => a.name)])];
  const covered = targets.filter((t) => new RegExp(`\\b${escapeRegex(t)}\\b`).test(spec)).length;
  const coverage = targets.length ? covered / targets.length : null; // null = nothing name-checkable

  let status;
  if (!hasSpec) status = "none";
  else if (hasTodos || onlyRenders) status = "stub";
  else if (testCount >= 3 && (coverage === null || coverage >= 0.6)) status = "solid";
  else status = "partial";

  return {
    component: s.className,
    selector: s.selector,
    rel,
    package: (rel.match(/packages\/Angular\/[^/]+\/([^/]+)/) || [])[1] || (rel.match(/packages\/Angular\/([^/]+)/) || [])[1] || "?",
    status,
    tests: testCount,
    targets: targets.length,
    covered,
    surfaceSize: targets.length + s.behaviors.gating.length,
    used: usageOf(s.selector),
    deferred: deferralReason(rel),
  };
}

const SEVERITY = { none: 3, stub: 2, partial: 1, solid: 0 };
const rows = walk(scanRoot).map(scoreComponent).filter(Boolean);

// --- output ---
if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const n = rows.length;
const by = (st) => rows.filter((r) => r.status === st).length;
const gaps = rows.filter((r) => r.status !== "solid");
const deferredGaps = gaps.filter((r) => r.deferred).length;
const covPct = n ? Math.round(((n - gaps.length) / n) * 100) : 0;

console.log(`\nDOM-test visibility — ${scope}\n${"=".repeat(40)}`);
console.log(`${n} components · ${covPct}% solid`);
console.log(`  solid ${by("solid")}   partial ${by("partial")}   stub ${by("stub")}   none ${by("none")}`);
console.log(`  gaps: ${gaps.length} (${deferredGaps} are intentional skips — still counted)\n`);

// rank gaps: worst status first, then most-used first (importance), then biggest surface.
gaps.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || b.used - a.used || b.surfaceSize - a.surfaceSize);

const list = showAll ? rows.slice().sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || b.used - a.used) : gaps.slice(0, topN);
const pad = (s, w) => String(s).padEnd(w);
console.log(`${pad("STATUS", 8)}${pad("USED", 6)}${pad("TESTS", 6)}${pad("COVERS", 8)}COMPONENT`);
console.log("-".repeat(78));
for (const r of list) {
  const cov = r.targets ? `${r.covered}/${r.targets}` : "-";
  const note = r.deferred ? `  (skip: ${r.deferred})` : "";
  console.log(`${pad(r.status, 8)}${pad(r.used, 6)}${pad(r.tests, 6)}${pad(cov, 8)}${r.component}${note}`);
}
if (!showAll && gaps.length > topN) console.log(`… and ${gaps.length - topN} more gaps (use --top=${gaps.length} or --all)`);
console.log("");
