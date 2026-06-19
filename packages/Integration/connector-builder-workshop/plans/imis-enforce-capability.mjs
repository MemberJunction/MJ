#!/usr/bin/env node
// imis-enforce-capability.mjs — PLAN-LOCAL deterministic enforcement of the capability↔column
// bijection on the iMIS metadata file. iMIS-ONLY; mirrors the shared pipeline's §0b
// enforce-finding-floor.mjs pattern ("a CODE step guarantees the invariant on the WRITTEN metadata
// regardless of what the extractor emitted"). The LLM extractor empirically refused to derive these
// flags across 7 rounds (SupportsCreate=None on all 216 IOs), so this enforces the rule the framework
// already mandates (connector-code-conventions: capability flag true IFF its path+method pair is set;
// and the inverse — null pair ⇒ flag false). Pure tautology, no connector-shape judgment.
//
// Usage:  node imis-enforce-capability.mjs <path-to-.imis.integration.json>
// Output: one JSON line of stats to stdout. Writes the file in place (a .backups copy is kept by the
// pipeline's own MCP writes; this is an enforcement pass, not authorship).
import fs from 'node:fs';

const p = process.argv[2];
if (!p) { console.error('usage: imis-enforce-capability.mjs <metadata.json>'); process.exit(1); }

const nonEmpty = (v) => v !== undefined && v !== null && String(v).trim() !== '';

const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const root = Array.isArray(d) ? d[0] : d;
const ios = root?.relatedEntities?.['MJ: Integration Objects'] ?? [];

let flagsFixed = 0, iosTouched = 0;
for (const io of ios) {
  const f = io?.fields;
  if (!f) continue;
  let touched = false;
  const enforce = (flag, want) => {
    const v = !!want;
    if (f[flag] !== v) { f[flag] = v; flagsFixed++; touched = true; }
  };
  const canCreate = nonEmpty(f.CreateAPIPath) && nonEmpty(f.CreateMethod);
  const canUpdate = nonEmpty(f.UpdateAPIPath) && nonEmpty(f.UpdateMethod);
  const canDelete = nonEmpty(f.DeleteAPIPath) && nonEmpty(f.DeleteMethod);
  enforce('SupportsCreate', canCreate);
  enforce('SupportsUpdate', canUpdate);
  enforce('SupportsDelete', canDelete);
  enforce('SupportsWrite', canCreate || canUpdate || canDelete);
  if (touched) iosTouched++;
}

fs.writeFileSync(p, JSON.stringify(d, null, 2));
process.stdout.write(JSON.stringify({ ios: ios.length, flagsFixed, iosTouched }) + '\n');
