/**
 * Post-publish back-merge entry point: main -> next, then refresh pnpm-lock.yaml with the
 * @memberjunction/* versions publish.yml just pushed to npm.
 *
 * Runs as publish.yml's final step. This file is deliberately thin — it owns the
 * `simple-git` dependency and the sequencing; the merge/refresh rules (and the reasons
 * behind them) live in ./back-merge.mjs, which imports nothing outside Node's stdlib so
 * its tests can run with no install at all.
 */
import { simpleGit } from 'simple-git';
import { mergeMainIntoNext, refreshLockfile, LOCKFILE, nextPushRemote } from './back-merge.mjs';

async function main() {
  const git = simpleGit();

  console.log('Fetching and merging main branch...');
  const { lockfileConflicted } = await mergeMainIntoNext(git);
  if (lockfileConflicted) {
    console.log(`${LOCKFILE} conflicted — regenerating it from the merged manifests.`);
  }

  await refreshLockfile(git, { required: lockfileConflicted });

  // `next` is protected and only the release App may push to it — see nextPushRemote().
  // The merge above still reads from `origin`; only the write is redirected.
  const remote = nextPushRemote();
  console.log(`\nPushing to ${remote}/next...`);
  await git.push(remote, 'HEAD:next');
  console.log(`Successfully merged main and updated ${LOCKFILE} in next branch`);
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
