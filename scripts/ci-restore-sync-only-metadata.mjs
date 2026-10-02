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
 *
 * Setting `push.writeSyncMetadata: false` is not the alternative it appears to be: it is read
 * from entityConfig, and that committed config is what the build engineer's release push
 * uses — which must write sync blocks.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Recursively drop everything the push writes back, so two trees compare on real content alone.
 *
 * Two things qualify, for the same reason:
 *
 *  - **`sync` blocks** — lastModified + checksum, rewritten for every record pushed.
 *  - **`deleteRecord.deletedAt`** — stamped onto a `deleteRecord` directive once the delete has
 *    actually run. It is per-environment bookkeeping that makes the deletion one-time, so a PR
 *    must not commit one: the release push would then SKIP the delete, no DELETE statement would
 *    reach the SQL log, and every other database would keep the rows the directive exists to
 *    remove. The `delete: true` flag itself is real content and is never stripped.
 *
 * Applied to both sides of the comparison, so a `deletedAt` that is legitimately committed
 * already (the auto-generated integration action files carry many) matches itself rather than
 * reading as drift.
 */
export const stripSync = (node) => {
  if (Array.isArray(node)) return node.map(stripSync);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k]) => k !== 'sync')
        .map(([k, v]) => [
          k,
          k === 'deleteRecord' && v && typeof v === 'object' && !Array.isArray(v)
            ? stripSync(Object.fromEntries(Object.entries(v).filter(([dk]) => dk !== 'deletedAt')))
            : stripSync(v),
        ]),
    );
  }
  return node;
};

/**
 * True when `currentText` and `headText` describe the same records once `sync` blocks are
 * ignored. Throws if either side is not parseable — an unreadable file is not a file we may
 * silently revert.
 */
export const isSyncOnlyChange = (currentText, headText) =>
  JSON.stringify(stripSync(JSON.parse(currentText))) === JSON.stringify(stripSync(JSON.parse(headText)));

/**
 * Restore every modified `metadata/**.json` whose only delta is `sync` blocks.
 * Returns what it did, so a caller (or a test) can assert on it rather than parse stdout.
 */
export function restoreSyncOnlyMetadata({ cwd = process.cwd() } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });

  const changed = git('diff', '--name-only', '--', 'metadata/')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.json'));

  const restored = [];
  const kept = [];

  for (const file of changed) {
    try {
      const current = readFileSync(path.join(cwd, file), 'utf8');
      const head = git('show', `HEAD:${file}`);
      if (isSyncOnlyChange(current, head)) {
        git('checkout', '--', file);
        restored.push(file);
      } else {
        kept.push({ file, reason: 'differs beyond sync blocks' });
      }
    } catch (err) {
      kept.push({ file, reason: `could not compare: ${err.message}` });
    }
  }

  return { restored, kept, git };
}

function main() {
  const { restored, kept, git } = restoreSyncOnlyMetadata();

  for (const f of restored) console.log(`restored (sync blocks only): ${f}`);
  console.log(`\n${restored.length} file(s) restored, ${kept.length} left dirty for the drift step.`);

  if (kept.length > 0) {
    console.log('\nThe push wrote more than sync blocks into these files:');
    for (const k of kept) console.log(`  - ${k.file} (${k.reason})`);
    console.log(
      '\nA minted primaryKey here means a new record shipped without the hand-run `uuidgen`\n' +
        'ID that metadata/CLAUDE.md rule 1 requires. Full delta:\n',
    );
    // Printed, not thrown: the drift step is what fails the job, and it must see the tree
    // exactly as this script left it.
    console.log(git('diff', '--', 'metadata/'));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
