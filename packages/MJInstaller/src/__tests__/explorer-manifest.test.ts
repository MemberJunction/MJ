import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The distribution's `apps/MJExplorer/package.json` is not a template — it is
 * this repo's `packages/MJExplorer/package.json`, copied byte-for-byte by
 * DistributionAssembler (BASE_MAPPINGS) through a transform that rewrites
 * `scripts` only. So the manifest under test here is literally what ships.
 *
 * Why this matters (issue #4427): the monorepo hides missing Angular peers two
 * ways that a host repo does not inherit — the root package.json declares
 * `@angular/compiler`, and the dev workspace's .npmrc sets auto-install-peers.
 * Worse, DependencyPhase retries `npm install` with `--legacy-peer-deps` on
 * ERESOLVE, and that flag disables npm's automatic peer installation outright.
 * Any build-time peer this manifest does not declare itself is therefore simply
 * absent in the installed host repo, and surfaces as a bare ERR_MODULE_NOT_FOUND
 * naming a bundle chunk rather than the missing package.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const explorerManifestPath = join(repoRoot, 'packages', 'MJExplorer', 'package.json');

describe('shipped MJExplorer manifest', () => {
  const manifest = JSON.parse(readFileSync(explorerManifestPath, 'utf8'));
  const devDependencies: Record<string, string> = manifest.devDependencies ?? {};

  it('is the manifest this test thinks it is', () => {
    expect(manifest.name).toBe('mj_explorer');
  });

  it('declares @angular/compiler, the non-optional peer of @angular/compiler-cli', () => {
    // Not inherited from the root manifest and not auto-installed under
    // --legacy-peer-deps: the Explorer app has to declare it itself.
    expect(devDependencies['@angular/compiler']).toBeDefined();
  });

  it('pins @angular/compiler to exactly the @angular/compiler-cli version', () => {
    // Angular declares the peer at an exact version. A caret or a skewed pin
    // reintroduces the ERESOLVE that triggers the --legacy-peer-deps retry.
    expect(devDependencies['@angular/compiler']).toBe(devDependencies['@angular/compiler-cli']);
  });
});
