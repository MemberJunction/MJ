import { simpleGit } from 'simple-git';

const git = simpleGit();
const version = process.env.VERSION;

await git.add('./*').commit('Update distribution zip [skip ci]');

console.log('\nPushing to origin/main...');
await git.push('origin', 'HEAD:main');

if (version) {
  await git.addTag(version);
  await git.push('origin', `refs/tags/${version}`);
}
