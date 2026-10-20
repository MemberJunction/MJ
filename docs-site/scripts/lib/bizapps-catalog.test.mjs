import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURED_REPOS, buildCatalog, normalizeDependencies, satisfiesRange, shortName, summarize } from './bizapps-catalog.mjs';

const repo = (name, extra = {}) => ({ name, html_url: `https://github.com/MemberJunction/${name}`, description: '', default_branch: 'next', ...extra });
const onMain = (manifest) => ({ ref: 'main', manifest });
const onNext = (manifest) => ({ ref: 'next', manifest });
const dep = (name, repoName, version = '>=1.0.0 <2.0.0') => ({ [name]: { version, repository: `https://github.com/MemberJunction/${repoName}` } });

/** A small world: common <- tasks <- accounting <- orders <- sales, and sales also on tasks + accounting. */
function world(overrides = {}) {
  return {
    org: 'MemberJunction',
    repos: [
      { repo: repo('bizapps-common'), manifest: onMain({ name: 'mj-bizapps-common', displayName: 'BizApps Common', version: '5.0.0', description: 'People and organizations. Shared by everything.', schema: '__mj_BizAppsCommon', icon: 'fa-solid fa-building-columns', color: '#264faf' }) },
      { repo: repo('bizapps-tasks'), manifest: onMain({ name: 'mj-bizapps-tasks', displayName: 'Tasks', version: '1.9.0', dependencies: dep('mj-bizapps-common', 'bizapps-common', '>=5.0.0 <6.0.0') }) },
      {
        repo: repo('bizapps-accounting'),
        // Array form, resolved by app name (no repository URL) — both shapes are legal in mj-app.json.
        manifest: onMain({ name: 'mj-bizapps-accounting', displayName: 'BizApps Accounting', version: '0.2.0', dependencies: [{ name: 'mj-bizapps-common', versionRange: '>=5.0.0 <6.0.0' }, { name: 'mj-bizapps-tasks', versionRange: '>=1.0.0 <2.0.0' }] }),
      },
      {
        repo: repo('bizapps-orders'),
        manifest: onMain({ name: 'mj-bizapps-orders', displayName: 'BizApps Orders', version: '5.1.0', dependencies: { ...dep('mj-bizapps-accounting', 'bizapps-accounting', '>=0.1.0 <1.0.0'), ...dep('mj-bizapps-common', 'bizapps-common', '>=5.0.0 <6.0.0') } }),
      },
      {
        repo: repo('bizapps-sales'),
        manifest: onMain({
          name: 'mj-bizapps-sales',
          displayName: 'BizApps Sales',
          version: '6.0.0',
          dependencies: {
            ...dep('mj-bizapps-orders', 'bizapps-orders', '>=5.0.0 <6.0.0'),
            ...dep('mj-bizapps-accounting', 'bizapps-accounting', '>=0.1.0 <1.0.0'),
            ...dep('mj-bizapps-tasks', 'bizapps-tasks', '>=1.0.0 <2.0.0'),
            ...dep('mj-bizapps-contracts', 'bizapps-contracts', '>=0.1.0 <1.0.0'),
          },
        }),
      },
      { repo: repo('bizapps-voting', { description: 'From GitHub' }), manifest: onNext({ name: 'mj-bizapps-voting', displayName: 'BizApps Voting', version: '0.0.0' }) },
      { repo: repo('bizapps-newthing', { description: 'A brand new repo.' }), manifest: { ref: null, manifest: null } },
    ],
    featured: [],
    ...overrides,
  };
}

test('buildCatalog: names, descriptions, schema, icon and color come from each manifest', () => {
  const catalog = buildCatalog(world());
  const common = catalog.apps.find((a) => a.id === 'bizapps-common');
  assert.equal(common.name, 'Common');
  assert.equal(common.description, 'People and organizations. Shared by everything.');
  assert.equal(common.summary, 'People and organizations.');
  assert.equal(common.schema, '__mj_BizAppsCommon');
  assert.equal(common.icon, 'fa-solid fa-building-columns');
  assert.equal(common.color, '#264FAF');
  assert.equal(common.manifestUrl, 'https://github.com/MemberJunction/bizapps-common/blob/main/mj-app.json');
  // No manifest: GitHub description and a name derived from the repo.
  const fresh = catalog.apps.find((a) => a.id === 'bizapps-newthing');
  assert.equal(fresh.name, 'Newthing');
  assert.equal(fresh.description, 'A brand new repo.');
  assert.equal(fresh.status, 'no-manifest');
  assert.equal(fresh.manifestUrl, null);
});

test('buildCatalog: released only when the manifest is on main at a real version', () => {
  const catalog = buildCatalog(world());
  const status = Object.fromEntries(catalog.apps.map((a) => [a.id, [a.status, a.version]]));
  assert.deepEqual(status['bizapps-tasks'], ['released', '1.9.0']);
  assert.deepEqual(status['bizapps-voting'], ['in-development', null]);
  const zero = buildCatalog(world({ repos: [{ repo: repo('bizapps-x'), manifest: onMain({ name: 'x', version: '0.0.0' }) }] }));
  assert.equal(zero.apps[0].status, 'in-development');
  const broken = buildCatalog(world({ repos: [{ repo: repo('bizapps-x'), manifest: { ref: null, manifest: null, error: '500' } }] }));
  assert.equal(broken.apps[0].status, 'unavailable');
});

test('buildCatalog: dependencies resolve by repository URL or app name; the rest are external', () => {
  const catalog = buildCatalog(world());
  const byId = new Map(catalog.apps.map((a) => [a.id, a]));
  assert.deepEqual(byId.get('bizapps-accounting').dependsOn, ['bizapps-common', 'bizapps-tasks']);
  assert.deepEqual(byId.get('bizapps-sales').dependsOn, ['bizapps-accounting', 'bizapps-orders', 'bizapps-tasks']);
  assert.deepEqual(byId.get('bizapps-sales').dependsOnExternal.map((d) => d.name), ['mj-bizapps-contracts']);
  assert.deepEqual(byId.get('bizapps-common').usedBy, ['bizapps-accounting', 'bizapps-orders', 'bizapps-tasks']);
});

test('buildCatalog: layers are longest-path, and edges implied by another path are flagged', () => {
  const catalog = buildCatalog(world());
  assert.deepEqual(catalog.layers[0], ['bizapps-common', 'bizapps-newthing', 'bizapps-voting']);
  assert.deepEqual(catalog.layers.slice(1), [['bizapps-tasks'], ['bizapps-accounting'], ['bizapps-orders'], ['bizapps-sales']]);
  const direct = catalog.edges.filter((e) => !e.implied).map((e) => `${e.from}>${e.to}`);
  assert.deepEqual(direct, ['bizapps-accounting>bizapps-orders', 'bizapps-common>bizapps-tasks', 'bizapps-orders>bizapps-sales', 'bizapps-tasks>bizapps-accounting']);
  const implied = catalog.edges.filter((e) => e.implied).map((e) => `${e.from}>${e.to}`);
  assert.ok(implied.includes('bizapps-common>bizapps-accounting'));
  assert.ok(implied.includes('bizapps-tasks>bizapps-sales'));
});

test('buildCatalog: a declared range the dependency release does not satisfy is warned, never rendered', () => {
  const warnings = [];
  const source = world();
  source.repos[1].manifest.manifest.dependencies = dep('mj-bizapps-common', 'bizapps-common', '>=4.0.0 <5.0.0');
  buildCatalog(source, (m) => warnings.push(m));
  const rangeWarnings = warnings.filter((w) => w.includes(' requires '));
  assert.equal(rangeWarnings.length, 1);
  assert.match(rangeWarnings[0], /bizapps-tasks requires mj-bizapps-common >=4\.0\.0 <5\.0\.0, but bizapps-common is released at 5\.0\.0/);
});

test('buildCatalog: a story naming an app outside the catalog is dropped with a warning', () => {
  const warnings = [];
  const catalog = buildCatalog(world(), (m) => warnings.push(m));
  assert.equal(catalog.stories.length, 0);
  assert.match(warnings.join('\n'), /dropping story "quote-to-cash"/);
});

test('buildCatalog: featured repos keep config order and text, and point back into the catalog', () => {
  const catalog = buildCatalog(
    world({
      featured: [
        { name: 'Forge', repo: repo('Forge', { description: 'GitHub says something else' }), manifest: null },
        {
          name: 'more-cheese',
          repo: repo('more-cheese', { description: 'Most Cheese' }),
          manifest: onMain({ description: 'The demo association.', icon: 'fa-solid fa-cheese', color: '#E8A33D', dependencies: { ...dep('mj-bizapps-common', 'bizapps-common'), ...dep('skip-client', 'Skip-Client-Open-App') } }),
        },
      ],
    }),
  );
  assert.deepEqual(catalog.featured.map((f) => f.repo), FEATURED_REPOS.map((f) => f.repo).filter((r) => r !== 'loom'));
  const cheese = catalog.featured.find((f) => f.repo === 'more-cheese');
  assert.equal(cheese.description, 'The demo association.');
  assert.equal(cheese.color, '#E8A33D');
  assert.deepEqual(cheese.composes, ['bizapps-common']);
  const forge = catalog.featured.find((f) => f.repo === 'Forge');
  assert.equal(forge.description, FEATURED_REPOS.find((f) => f.repo === 'Forge').description);
  assert.equal(forge.icon, 'fa-solid fa-database');
});

test('buildCatalog: invalid colors and icon strings are ignored', () => {
  const catalog = buildCatalog(world({ repos: [{ repo: repo('bizapps-x'), manifest: onMain({ name: 'x', version: '1.0.0', color: 'blue', icon: 'cart' }) }] }));
  assert.equal(catalog.apps[0].color, null);
  assert.equal(catalog.apps[0].icon, null);
});

test('buildCatalog: output is deterministic regardless of input order', () => {
  const a = buildCatalog(world());
  const shuffled = world();
  shuffled.repos.reverse();
  assert.deepEqual(buildCatalog(shuffled), a);
});

test('normalizeDependencies: object and array forms', () => {
  assert.deepEqual(normalizeDependencies({ dependencies: { a: { version: '^1.0.0', repository: 'r' } } }), [{ name: 'a', range: '^1.0.0', repository: 'r' }]);
  assert.deepEqual(normalizeDependencies({ dependencies: [{ name: 'a', versionRange: '>=1.0.0', repository: 'r' }] }), [{ name: 'a', range: '>=1.0.0', repository: 'r' }]);
  assert.deepEqual(normalizeDependencies({}), []);
  assert.deepEqual(normalizeDependencies(null), []);
});

test('shortName: strips the family prefixes, falls back to the repo name', () => {
  assert.equal(shortName('BizApps Accounting', 'bizapps-accounting'), 'Accounting');
  assert.equal(shortName('MJ Secure Messaging', 'bizapps-secure-messaging'), 'Secure Messaging');
  assert.equal(shortName('Tasks', 'bizapps-tasks'), 'Tasks');
  assert.equal(shortName(undefined, 'bizapps-secure-messaging'), 'Secure Messaging');
});

test('summarize: first sentence, cut at a word boundary when long', () => {
  assert.equal(summarize('One. Two.'), 'One.');
  assert.equal(summarize('No full stop'), 'No full stop');
  const long = summarize(`${'word '.repeat(60)}end.`);
  assert.ok(long.length <= 170);
  assert.ok(long.endsWith('…'));
  assert.equal(summarize(''), '');
});

test('satisfiesRange: the range shapes mj-app.json uses', () => {
  assert.equal(satisfiesRange('5.54.0', '>=5.43.0 <6.0.0'), true);
  assert.equal(satisfiesRange('6.17.0', '>=5.2.0 <6.0.0'), false);
  assert.equal(satisfiesRange('1.9.0', '^1.4.0'), true);
  assert.equal(satisfiesRange('2.0.0', '^1.4.0'), false);
  assert.equal(satisfiesRange('0.3.0', '^0.2.0'), false);
  assert.equal(satisfiesRange('1.2.9', '~1.2.0'), true);
  assert.equal(satisfiesRange('6.1.0', '>=6.1.0-edge.6 <7.0.0'), true);
  assert.equal(satisfiesRange('6.1.0-edge.5', '>=6.1.0-edge.6 <7.0.0'), false);
  assert.equal(satisfiesRange('1.0.0', '<1.0.0 || >=2.0.0'), false);
  assert.equal(satisfiesRange('2.1.0', '<1.0.0 || >=2.0.0'), true);
  assert.equal(satisfiesRange('1.0.0', 'latest'), null);
  assert.equal(satisfiesRange('nope', '>=1.0.0'), null);
});
