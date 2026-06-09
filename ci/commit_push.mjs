import { simpleGit } from 'simple-git';

// Run by the publish workflow (main branch only) after `changeset publish`.
// `changeset version` has already committed the version bump locally; this script
// pushes that release commit to origin/main and publishes the vX.Y.Z release tag.
// Historically this also committed the bootstrap zip — that step is gone, but the
// commit-and-tag responsibility lived here and must stay (see commit 4f03b0113a).
const git = simpleGit();
const version = process.env.VERSION;

if (!version) {
  throw new Error('VERSION env var is required to tag the release — refusing to push an untagged release.');
}

// The build step regenerates version-stamped files (e.g. version.generated.ts and the
// class-registration manifests) into the working tree. Commit them so main matches what
// was published and the tree is clean for the subsequent `git checkout next`.
await git.add('./*');
const stagedCount = (await git.status()).staged.length;
if (stagedCount > 0) {
  console.log(`Committing ${stagedCount} post-release generated file(s)...`);
  await git.commit('chore: post-release generated files [skip ci]');
}

console.log('Pushing release commit to origin/main...');
await git.push('origin', 'HEAD:main');

console.log(`Publishing release tag ${version}...`);
await git.addTag(version);
await git.push('origin', `refs/tags/${version}`);
