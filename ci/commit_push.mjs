import { gitAsync } from 'beachball/lib/git/gitAsync.js';
import { findProjectRoot } from 'workspace-tools';

const version = process.env.VERSION;

const message = 'Update distribution zip [skip ci]';
const cwd = findProjectRoot(process.cwd());

const commitResult = await gitAsync(['commit', '--all', '-m', message], {
  cwd,
  verbose: true,
});
if (!commitResult.success) {
  console.error(JSON.stringify(commitResult));
  throw new Error(`Committing has failed!`);
}

if (version) {
  const tagResult = await gitAsync(['tag', version], { cwd, verbose: true });
  if (!tagResult.success) {
    console.error(JSON.stringify(tagResult));
    throw new Error(`Tagging with ${version} has failed!`);
  }
}

console.log('\nPushing to origin/main...');

const pushResult = await gitAsync(['push', '--no-verify', '--follow-tags', '--verbose', 'origin', 'HEAD:main'], {
  cwd,
  verbose: true,
});
if (!pushResult.success) {
  console.error(JSON.stringify(pushResult));
  throw new Error('Pushing to origin/main has failed!');
}
