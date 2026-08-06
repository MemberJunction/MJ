/**
 * Manual escape hatch for the main -> next back-merge (npm script `mergemain`), for when
 * publish.yml's own back-merge step needs re-running by hand.
 *
 * Shares mergeMainIntoNext() with the workflow path so both refuse to guess at a
 * conflict — see the note there on why `-X theirs` was removed. This variant cannot
 * regenerate the lockfile, so a lockfile conflict is a hard stop here rather than
 * something to paper over.
 */
import { simpleGit } from 'simple-git';
import { mergeMainIntoNext, LOCKFILE } from './back-merge.mjs';

const git = simpleGit();
const { lockfileConflicted } = await mergeMainIntoNext(git);

if (lockfileConflicted) {
  console.error(
    `FAIL ${LOCKFILE} conflicted and the tree now holds a placeholder copy. Nothing was ` +
      `pushed. Use \`pnpm run mergemain:update-lock\` instead, which regenerates it.`
  );
  process.exit(1);
}

console.log(`\nPushing to origin/next...`);
await git.push('origin', 'HEAD:next');
