import { gitFetch } from 'beachball/lib/git/fetch.js';
import { gitAsync } from 'beachball/lib/git/gitAsync.js';
import { findProjectRoot, parseRemoteBranch } from 'workspace-tools';

const branch = 'main';
const { remote, remoteBranch } = parseRemoteBranch(branch);
const cwd = findProjectRoot(process.cwd());

const fetchResult = gitFetch({ remote, branch: remoteBranch, cwd, verbose: true });
if (!fetchResult.success) {
  throw new Error(`Fetching from ${branch} has failed!`);
}

const mergeResult = await gitAsync(['merge', '-X', 'theirs', branch], { cwd, verbose: true });
if (!mergeResult.success) {
  throw new Error(`Merging with latest ${branch} has failed!`);
}

console.log(`\nPushing to ${branch}...`);

const pushResult = await gitAsync(['push', '--no-verify', '--follow-tags', '--verbose', remote, `HEAD:${remoteBranch}`], {
  cwd,
  verbose: true,
});
if (pushResult.success) {
  completed = true;
} else if (pushResult.timedOut) {
  throw new Error(`Pushing to ${branch} has timed out!`);
} else {
  throw new Error(`Pushing to ${branch} has failed!`);
}
