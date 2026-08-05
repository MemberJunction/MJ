import { simpleGit } from 'simple-git';
import { execSync } from 'child_process';
import fs from 'fs';

const LOCKFILE = 'pnpm-lock.yaml';

const git = simpleGit();

// First, do the merge
console.log('Fetching and merging main branch...');
await git.fetch('origin', 'main');
await git.merge(['-X', 'theirs', 'origin/main']);

// Update the lockfile with the newly published versions.
console.log(`\nUpdating ${LOCKFILE} with new package versions...`);
try {
  // --lockfile-only resolves and rewrites the lockfile without materializing
  // node_modules — the pnpm equivalent of `npm install --package-lock-only`.
  execSync('pnpm install --lockfile-only', { stdio: 'inherit' });

  const status = await git.status();
  const lockFileModified = status.modified.includes(LOCKFILE) ||
                          status.not_added.includes(LOCKFILE);

  if (lockFileModified) {
    console.log(`${LOCKFILE} has been updated with new versions`);

    // Get the version from package.json for commit message
    const packageJson = JSON.parse(fs.readFileSync('packages/MJCore/package.json', 'utf8'));
    const version = packageJson.version;

    // Stage and commit the lock file
    await git.add(LOCKFILE);
    await git.commit(`chore: Update ${LOCKFILE} with v${version} dependencies

Updates @memberjunction/* package versions in lock file after publishing v${version}`);

    console.log(`Committed ${LOCKFILE} updates`);
  } else {
    console.log(`No changes to ${LOCKFILE} needed`);
  }
} catch (error) {
  console.error(`Error updating ${LOCKFILE}:`, error);
  // Deliberate: a lockfile refresh failure must not fail an already-published
  // release. The error is logged above; the merge and push still proceed.
  console.log(`Continuing despite ${LOCKFILE} update error...`);
}

// Push everything to next
console.log('\nPushing to origin/next...');
await git.push('origin', 'HEAD:next');

console.log(`Successfully merged main and updated ${LOCKFILE} in next branch`);
