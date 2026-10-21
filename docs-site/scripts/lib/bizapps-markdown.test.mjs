import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from './bizapps-catalog.mjs';
import { githubSlug, renderGuideMarkdown, text } from './bizapps-markdown.mjs';

const repo = (name) => ({ name, html_url: `https://github.com/MemberJunction/${name}`, description: '', default_branch: 'next' });
const manifest = (ref, m) => ({ ref, manifest: m });
const on = (name, repoName) => ({ [name]: { version: '>=1.0.0', repository: `https://github.com/MemberJunction/${repoName}` } });

function catalog() {
  return buildCatalog({
    repos: [
      { repo: repo('bizapps-common'), manifest: manifest('main', { name: 'mj-bizapps-common', displayName: 'BizApps Common', version: '5.0.0', description: 'Shared people.' }) },
      { repo: repo('bizapps-tasks'), manifest: manifest('main', { name: 'mj-bizapps-tasks', displayName: 'Tasks', version: '1.0.0', description: 'Tasks.', dependencies: on('mj-bizapps-common', 'bizapps-common') }) },
      {
        repo: repo('bizapps-secure-messaging'),
        manifest: manifest('main', {
          name: 'mj-secure-messaging',
          displayName: 'MJ Secure Messaging',
          version: '2.0.0',
          description: 'A portal with an embeddable <mj-secure-messaging> element | and a pipe.',
          schema: '__mj_BizAppsSecureMessaging',
          packages: { server: [{ name: '@mj-biz-apps/secure-messaging-server' }] },
          dependencies: { ...on('mj-bizapps-common', 'bizapps-common'), ...on('mj-bizapps-tasks', 'bizapps-tasks') },
        }),
      },
      { repo: repo('bizapps-voting'), manifest: manifest('next', { name: 'mj-bizapps-voting', displayName: 'BizApps Voting', version: '0.0.0', dependencies: on('mj-bizapps-common', 'bizapps-common') }) },
    ],
    featured: [{ name: 'more-cheese', repo: repo('more-cheese'), manifest: manifest('main', { description: 'Demo.', dependencies: on('mj-bizapps-tasks', 'bizapps-tasks') }) }],
  });
}

test('renderGuideMarkdown: a generated-file banner, the map, the table and a section per app', () => {
  const md = renderGuideMarkdown(catalog());
  assert.match(md, /^<!--\n {2}GENERATED FILE/);
  assert.match(md, /^# MemberJunction BizApps$/m);
  assert.match(md, /```mermaid\nflowchart LR\n/);
  assert.match(md, /^### Secure Messaging$/m);
  assert.match(md, /\| \[Tasks\]\(#tasks\) \| Tasks\. \| \[Common\]\(#common\) \| Released \|/);
  assert.match(md, /- \*\*Database schema:\*\* `__mj_BizAppsSecureMessaging`/);
  assert.match(md, /`@mj-biz-apps\/secure-messaging-server` \(server\)/);
  assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'));
});

test('renderGuideMarkdown: the map draws direct links only, and dashes apps in development', () => {
  const md = renderGuideMarkdown(catalog());
  const mermaid = md.match(/```mermaid\n([\s\S]*?)```/)[1];
  assert.match(mermaid, /bizapps_tasks --> bizapps_secure_messaging/);
  assert.doesNotMatch(mermaid, /bizapps_common --> bizapps_secure_messaging/);
  assert.match(mermaid, /class bizapps_voting dev/);
  assert.match(mermaid, /subgraph layer0\["Foundation"\]/);
});

test('renderGuideMarkdown: manifest prose never reaches GitHub as HTML or breaks a table', () => {
  const md = renderGuideMarkdown(catalog());
  assert.doesNotMatch(md, /<mj-secure-messaging>/);
  assert.match(md, /&lt;mj-secure-messaging&gt;/);
  assert.match(md, /element \\\| and a pipe/);
});

test('renderGuideMarkdown: low churn — no versions or dates', () => {
  const md = renderGuideMarkdown(catalog());
  assert.doesNotMatch(md, /5\.0\.0|1\.0\.0|2\.0\.0/);
  assert.doesNotMatch(md, /\b20\d\d-\d\d-\d\d\b/);
});

test('renderGuideMarkdown: featured repos sit below the catalog and link back into it', () => {
  const md = renderGuideMarkdown(catalog());
  assert.ok(md.indexOf('## Also in the MemberJunction org') > md.indexOf('## The apps'));
  assert.match(md, /### More Cheese\n\n\*Demo association\.\* Demo\.\n\nBuilds on 1 BizApps: \[Tasks\]\(#tasks\)\./);
});

test('githubSlug and text helpers', () => {
  assert.equal(githubSlug('Secure Messaging'), 'secure-messaging');
  assert.equal(githubSlug('FP&A'), 'fpa');
  assert.equal(text('a <b> c'), 'a &lt;b&gt; c');
});
