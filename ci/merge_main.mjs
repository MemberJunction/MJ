/**
 * Manual escape hatch for the main -> next back-merge (npm script `mergemain`), for when
 * publish.yml's own back-merge step needs re-running by hand.
 *
 * Shares mergeMainIntoNext() with the workflow path so both refuse to guess at a
 * conflict — see the note there on why `-X theirs` was removed. This variant cannot
 * regenerate the lockfile, so a lockfile conflict — or a resolved package.json conflict,
 * which the lockfile must follow — is a hard stop here rather than something to paper over.
 */
import { simpleGit } from 'simple-git';
import { mergeMainIntoNext, LOCKFILE, nextPushRemote } from './back-merge.mjs';

const git = simpleGit();
const { lockfileConflicted, manifestsResolved } = await mergeMainIntoNext(git);

if (lockfileConflicted || manifestsResolved.length > 0) {
  console.error(
    `FAIL the merge resolved conflicts that ${LOCKFILE} must be regenerated for. Nothing was ` +
      `pushed. Use \`pnpm run mergemain:update-lock\` instead, which regenerates it.`
  );
  process.exit(1);
}

const remote = nextPushRemote();
console.log(`\nPushing to ${remote}/next...`);
await git.push(remote, 'HEAD:next');
