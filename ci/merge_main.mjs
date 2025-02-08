import { simpleGit } from 'simple-git';

const git = simpleGit();

await git.fetch('origin', 'main');
await git.merge(['-X', 'theirs', 'origin/main']);

console.log(`\nPushing to origin/next...`);
await git.push('origin', 'HEAD:next');
