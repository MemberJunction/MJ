import { gitAsync } from 'beachball/lib/git/gitAsync.js';
import { findProjectRoot, parseRemoteBranch } from 'workspace-tools';

const branch = 'main';
const message = 'Update distribution zip [skip ci]';
const { remote, remoteBranch } = parseRemoteBranch(branch);
const cwd = findProjectRoot(process.cwd());

const commitResult = await gitAsync(['commit', '--all', '-m', message], {
  cwd,
  verbose: true,
});
if (!commitResult.success) {
  console.error(JSON.stringify(commitResult));
  throw new Error(`Committing has failed!`);
}

console.log(`\nPushing to ${branch}...`);

const pushResult = await gitAsync(['push', '--no-verify', '--follow-tags', '--verbose', remote, `HEAD:${remoteBranch}`], {
  cwd,
  verbose: true,
});
if (!pushResult.success) {
  console.error(JSON.stringify(pushResult));
  throw new Error(`Pushing to ${branch} has failed!`);
}
