import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBizAppsSource, isPublicBizApp } from './bizapps-source.mjs';

const ghRepo = (name, extra = {}) => ({
  name,
  html_url: `https://github.com/MemberJunction/${name}`,
  description: `${name} description`,
  private: false,
  visibility: 'public',
  archived: false,
  fork: false,
  default_branch: 'next',
  ...extra,
});

/**
 * A fake GitHub API. `files` maps "<repo>@<ref>" to manifest JSON (or a number:
 * an HTTP status to fail with). Records every call.
 */
function fakeGitHub({ org, files = {}, repos = {}, orgStatus = 200 }) {
  const calls = [];
  const respond = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: `${u.pathname}${u.search}`, auth: init.headers.Authorization, accept: init.headers.Accept });
    if (u.pathname === '/orgs/MemberJunction/repos') {
      if (orgStatus !== 200) return respond(orgStatus, { message: 'nope' });
      const page = Number(u.searchParams.get('page'));
      const size = Number(u.searchParams.get('per_page'));
      return respond(200, org.slice((page - 1) * size, page * size));
    }
    let m = u.pathname.match(/^\/repos\/MemberJunction\/([^/]+)\/contents\/mj-app\.json$/);
    if (m) {
      const file = files[`${m[1]}@${u.searchParams.get('ref')}`];
      if (typeof file === 'number') return respond(file, { message: 'error' });
      return file === undefined ? respond(404, { message: 'Not Found' }) : respond(200, JSON.stringify(file));
    }
    m = u.pathname.match(/^\/repos\/MemberJunction\/([^/]+)$/);
    if (m) {
      const found = repos[m[1].toLowerCase()];
      return found ? respond(200, found) : respond(404, { message: 'Not Found' });
    }
    return respond(404, { message: 'Not Found' });
  };
  return { fetchImpl, calls };
}

test('isPublicBizApp: public, live, original bizapps-* repos only', () => {
  assert.equal(isPublicBizApp(ghRepo('bizapps-tasks')), true);
  assert.equal(isPublicBizApp(ghRepo('bizapps-ats', { private: true, visibility: 'private' })), false);
  assert.equal(isPublicBizApp(ghRepo('bizapps-caliber', { private: true, visibility: 'internal' })), false);
  assert.equal(isPublicBizApp(ghRepo('bizapps-old', { archived: true })), false);
  assert.equal(isPublicBizApp(ghRepo('bizapps-fork', { fork: true })), false);
  assert.equal(isPublicBizApp(ghRepo('loom')), false);
  assert.equal(isPublicBizApp(ghRepo('bizapps-')), false);
  assert.equal(isPublicBizApp(ghRepo('BizApps-Upper')), true);
});

test('fetchBizAppsSource: discovers bizapps, reads main first, falls back to the default branch', async () => {
  const gh = fakeGitHub({
    org: [ghRepo('MJ'), ghRepo('bizapps-tasks'), ghRepo('bizapps-voting'), ghRepo('bizapps-bare'), ghRepo('bizapps-old', { archived: true }), ghRepo('loom')],
    files: {
      'bizapps-tasks@main': { name: 'mj-bizapps-tasks', version: '1.9.0' },
      'bizapps-voting@next': { name: 'mj-bizapps-voting', version: '0.0.0' },
    },
    repos: { loom: ghRepo('loom'), forge: ghRepo('Forge'), 'more-cheese': ghRepo('more-cheese') },
  });
  const source = await fetchBizAppsSource({ token: 't0k', fetchImpl: gh.fetchImpl });
  const byName = Object.fromEntries(source.repos.map((r) => [r.repo.name, r.manifest]));
  assert.deepEqual(Object.keys(byName).sort(), ['bizapps-bare', 'bizapps-tasks', 'bizapps-voting']);
  assert.equal(byName['bizapps-tasks'].ref, 'main');
  assert.equal(byName['bizapps-voting'].ref, 'next');
  assert.deepEqual(byName['bizapps-bare'], { ref: null, manifest: null });
  assert.ok(gh.calls.every((c) => c.auth === 'Bearer t0k'));
  assert.ok(gh.calls.filter((c) => c.path.includes('/contents/')).every((c) => c.accept === 'application/vnd.github.raw+json'));
  // Featured data carries GitHub's half only; the curated config is joined later.
  assert.deepEqual(source.featured.map((f) => f.name), ['more-cheese', 'loom', 'Forge']);
  assert.ok(source.featured.every((f) => !('config' in f)));
});

test('fetchBizAppsSource: a manifest read error degrades that app only', async () => {
  const warnings = [];
  const gh = fakeGitHub({ org: [ghRepo('bizapps-tasks'), ghRepo('bizapps-forms')], files: { 'bizapps-tasks@main': 500, 'bizapps-forms@main': { name: 'f', version: '1.0.0' } } });
  const source = await fetchBizAppsSource({ fetchImpl: gh.fetchImpl, warn: (m) => warnings.push(m) });
  const tasks = source.repos.find((r) => r.repo.name === 'bizapps-tasks');
  assert.equal(tasks.manifest.ref, null);
  assert.match(tasks.manifest.error, /500/);
  assert.match(warnings.join('\n'), /could not read bizapps-tasks\/mj-app\.json@main/);
  // It did not quietly fall back to the default branch and call a released app "in development".
  assert.ok(!gh.calls.some((c) => c.path.includes('bizapps-tasks/contents/mj-app.json?ref=next')));
});

test('fetchBizAppsSource: invalid manifest JSON is reported, not thrown', async () => {
  const warnings = [];
  const gh = fakeGitHub({ org: [ghRepo('bizapps-tasks')], files: {} });
  const original = gh.fetchImpl;
  const fetchImpl = async (url, init) => (url.includes('/contents/') ? { status: 200, ok: true, text: async () => '{ nope' } : original(url, init));
  const source = await fetchBizAppsSource({ fetchImpl, warn: (m) => warnings.push(m) });
  assert.equal(source.repos[0].manifest.manifest, null);
  assert.match(warnings.join('\n'), /bizapps-tasks\/mj-app\.json@main is not valid JSON/);
});

test('fetchBizAppsSource: pages through the org listing', async () => {
  const org = Array.from({ length: 150 }, (_, i) => ghRepo(i === 120 ? 'bizapps-late' : `other-${i}`));
  const gh = fakeGitHub({ org });
  const source = await fetchBizAppsSource({ fetchImpl: gh.fetchImpl });
  assert.deepEqual(source.repos.map((r) => r.repo.name), ['bizapps-late']);
  assert.equal(gh.calls.filter((c) => c.path.startsWith('/orgs/')).length, 2);
});

test('fetchBizAppsSource: discovery failures throw (the caller decides the fallback)', async () => {
  await assert.rejects(fetchBizAppsSource({ fetchImpl: fakeGitHub({ org: [], orgStatus: 403 }).fetchImpl }), /-> 403/);
  await assert.rejects(fetchBizAppsSource({ fetchImpl: fakeGitHub({ org: [ghRepo('MJ')] }).fetchImpl }), /no public/);
});

test('fetchBizAppsSource: a featured repo that is gone or private is left out', async () => {
  const warnings = [];
  const gh = fakeGitHub({
    org: [ghRepo('bizapps-tasks')],
    repos: { loom: ghRepo('loom', { private: true }), 'more-cheese': ghRepo('more-cheese') },
  });
  const source = await fetchBizAppsSource({ fetchImpl: gh.fetchImpl, warn: (m) => warnings.push(m) });
  assert.deepEqual(source.featured.map((f) => f.name), ['more-cheese']);
  assert.equal(warnings.filter((w) => /missing, private or archived/.test(w)).length, 2);
});
