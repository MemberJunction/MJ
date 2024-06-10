import { gitFetch } from 'beachball/lib/git/fetch.js';
import { gitAsync } from 'beachball/lib/git/gitAsync.js';
import { findProjectRoot } from 'workspace-tools';

const cwd = findProjectRoot(process.cwd());

const fetchResult = gitFetch({ remote: 'origin', branch: 'main', cwd, verbose: true });
if (!fetchResult.success) {
  throw new Error(`Fetching from origin/main has failed!`);
}

const mergeResult = await gitAsync(['merge', '-X', 'theirs', 'main'], { cwd, verbose: true });
if (!mergeResult.success) {
  throw new Error(`Merging with latest origin/main has failed!`);
}

console.log(`\nPushing to origin/main...`);

const pushResult = await gitAsync(['push', '--no-verify', '--follow-tags', '--verbose', 'origin', 'HEAD:main'], {
  cwd,
  verbose: true,
});
if (!pushResult.success) {
  console.error(JSON.stringify(pushResult));
  throw new Error('Pushing to origin/main has failed!');
}
