#!/usr/bin/env node
/**
 * Undo the CodeGen drift gate's setup-push write-back — but ONLY the part the gate is
 * entitled to ignore.
 *
 * The gate's `Migrate + sync push` step runs `mj sync push`, which writes a `sync` block
 * (lastModified + checksum) back into every record it pushes. That is its documented job
 * (metadata/CLAUDE.md rule 1), while rule 1b forbids a PR from committing those blocks —
 * the build engineer regenerates them at release. So a PR that merely ADDS a metadata
 * record leaves metadata/ dirty and the drift step fails it through no fault of its own.
 *
 * A blanket `git checkout -- metadata/` would fix that and cost too much: `sync` is not the
 * only thing the push writes back. PushService also mints a `primaryKey` for any record that
 * arrived without one (see "Update primaryKey for new records"), and that write happens
 * OUTSIDE the writeSyncMetadata guard. Reverting it wholesale would silently green-light the
 * exact rule-1 violation the dirty tree was reporting — a record with no hand-run `uuidgen`
 * ID, which then gets a different random UUID in every environment.
 *
 * So: restore a file only when stripping `sync` keys makes it identical to HEAD. Anything
 * else the push wrote — a minted primaryKey, a changed field — leaves the file dirty and the
 * drift step red, with the offending delta printed so the log says WHY rather than just
 * naming the file.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

/** Recursively drop every `sync` key, so two trees compare on real content alone. */
const stripSync = (node) => {
  if (Array.isArray(node)) return node.map(stripSync);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k]) => k !== 'sync')
        .map(([k, v]) => [k, stripSync(v)]),
    );
  }
  return node;
};

const changed = git('diff', '--name-only', '--', 'metadata/')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s.endsWith('.json'));

if (changed.length === 0) {
  console.log('No modified metadata/*.json files — nothing to restore.');
  process.exit(0);
}

let restored = 0;
const kept = [];

for (const file of changed) {
  let now, was;
  try {
    now = stripSync(JSON.parse(readFileSync(file, 'utf8')));
    was = stripSync(JSON.parse(git('show', `HEAD:${file}`)));
  } catch (err) {
    // A file we cannot parse is not a file we may silently revert.
    kept.push(`${file} (could not compare: ${err.message})`);
    continue;
  }

  if (JSON.stringify(now) === JSON.stringify(was)) {
    git('checkout', '--', file);
    console.log(`restored (sync blocks only): ${file}`);
    restored++;
  } else {
    kept.push(`${file} (differs beyond sync blocks)`);
  }
}

console.log(`\n${restored} file(s) restored, ${kept.length} left dirty for the drift step.`);

if (kept.length > 0) {
  console.log('\nThe push wrote more than sync blocks into these files:');
  for (const k of kept) console.log(`  - ${k}`);
  console.log(
    '\nA minted primaryKey here means a new record shipped without the hand-run `uuidgen`\n' +
      'ID that metadata/CLAUDE.md rule 1 requires. Full delta:\n',
  );
  // Printed, not thrown: the drift step is what fails the job, and it should see the tree
  // exactly as this script left it.
  console.log(git('diff', '--', 'metadata/'));
}
