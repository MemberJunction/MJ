import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformRepoMarkdown, buildFrontmatter, extractDescription } from './markdown.mjs';
import { rewriteHtmlValue, rewriteLinkTarget, rewriteImageTarget } from './rewrite.mjs';
import { guideSlug, labelFromSlug, packageSlug, relativeSiteLink, resolveRepoPath } from './site-map.mjs';

const SHA = 'abc1234';

function makeCtx(overrides = {}) {
  const warnings = [];
  return {
    srcRepoPath: 'guides/CACHING_AND_PUBSUB_GUIDE.md',
    currentSlug: 'guides/caching-and-pubsub',
    siteMap: new Map([
      ['guides/CACHING_AND_PUBSUB_GUIDE.md', 'guides/caching-and-pubsub'],
      ['guides/DASHBOARD_BEST_PRACTICES.md', 'guides/dashboard'],
      ['guides/README.md', 'guides'],
      ['packages/MJCore/README.md', 'packages/mjcore'],
      ['README.md', 'overview'],
    ]),
    sha: SHA,
    fileKind: (p) =>
      ({
        'packages/Angular/CLAUDE.md': 'file',
        'packages/MJCore/src/generic/baseEngine.ts': 'file',
        'packages/Angular': 'dir',
        'MJ_logo.webp': 'file',
        'MJ_logo_dark.png': 'file',
      })[p] ?? null,
    warn: (msg) => warnings.push(msg),
    warnings,
    ...overrides,
  };
}

test('slug derivation strips _GUIDE and kebab-cases', () => {
  assert.equal(guideSlug('CACHING_AND_PUBSUB_GUIDE.md'), 'caching-and-pubsub');
  assert.equal(guideSlug('DASHBOARD_BEST_PRACTICES.md'), 'dashboard');
  assert.equal(guideSlug('THEMING.md'), 'theming');
  assert.equal(guideSlug('UPGRADE-v5.0.md'), 'upgrade-v5-0');
});

test('package slug lowercases each segment', () => {
  assert.equal(packageSlug('packages/AI/Providers/OpenAI'), 'packages/ai/providers/openai');
});

test('label from slug title-cases the last segment', () => {
  assert.equal(labelFromSlug('guides/caching-and-pubsub'), 'Caching And Pubsub');
});

test('relative site links are base-agnostic and slash-terminated', () => {
  assert.equal(relativeSiteLink('guides/caching-and-pubsub', 'guides/dashboard'), '../dashboard/');
  assert.equal(relativeSiteLink('guides/caching-and-pubsub', 'guides'), '../');
  assert.equal(relativeSiteLink('overview', 'packages/mjcore'), '../packages/mjcore/');
  assert.equal(relativeSiteLink('guides/a', 'guides/a', 'anchor'), '#anchor');
  assert.equal(relativeSiteLink('guides/a', 'guides/a'), './');
});

test('resolveRepoPath handles ./, ../, root-relative, and repo escapes', () => {
  assert.equal(resolveRepoPath('guides/A.md', './B.md'), 'guides/B.md');
  assert.equal(resolveRepoPath('guides/A.md', '../packages/X/README.md'), 'packages/X/README.md');
  assert.equal(resolveRepoPath('guides/A.md', '/README.md'), 'README.md');
  assert.equal(resolveRepoPath('README.md', '../outside.md'), null);
});

test('sibling rendered file becomes a relative site link with anchor preserved', () => {
  const ctx = makeCtx();
  assert.equal(rewriteLinkTarget('./DASHBOARD_BEST_PRACTICES.md#page-chrome', ctx), '../dashboard/#page-chrome');
  assert.equal(ctx.warnings.length, 0);
});

test('unrendered repo file becomes SHA-pinned GitHub blob URL', () => {
  const ctx = makeCtx();
  assert.equal(
    rewriteLinkTarget('../packages/Angular/CLAUDE.md', ctx),
    `https://github.com/MemberJunction/MJ/blob/${SHA}/packages/Angular/CLAUDE.md`
  );
});

test('directory target becomes SHA-pinned GitHub tree URL', () => {
  const ctx = makeCtx();
  assert.equal(
    rewriteLinkTarget('../packages/Angular/', ctx),
    `https://github.com/MemberJunction/MJ/tree/${SHA}/packages/Angular`
  );
});

test('absolute, mailto, and pure-anchor links pass through untouched', () => {
  const ctx = makeCtx();
  for (const url of ['https://example.com/x.md', 'mailto:hi@example.com', '#local-heading', '//cdn.example.com/a']) {
    assert.equal(rewriteLinkTarget(url, ctx), url);
  }
  assert.equal(ctx.warnings.length, 0);
});

test('missing target is left unchanged and warned', () => {
  const ctx = makeCtx();
  assert.equal(rewriteLinkTarget('./DOES_NOT_EXIST.md', ctx), './DOES_NOT_EXIST.md');
  assert.equal(ctx.warnings.length, 1);
  assert.match(ctx.warnings[0], /not found/);
});

test('relative image becomes SHA-pinned raw URL', () => {
  const ctx = makeCtx({ srcRepoPath: 'README.md', currentSlug: 'overview' });
  assert.equal(
    rewriteImageTarget('./MJ_logo.webp', ctx),
    `https://raw.githubusercontent.com/MemberJunction/MJ/${SHA}/MJ_logo.webp`
  );
});

test('raw HTML blocks get src/srcset/href rewritten (the README <picture> case)', () => {
  const ctx = makeCtx({ srcRepoPath: 'README.md', currentSlug: 'overview' });
  const html = '<picture><source srcset="./MJ_logo_dark.png"><img src="./MJ_logo.webp" width="400"></picture>';
  const out = rewriteHtmlValue(html, ctx);
  assert.match(out, new RegExp(`srcset="https://raw\\.githubusercontent\\.com/MemberJunction/MJ/${SHA}/MJ_logo_dark\\.png"`));
  assert.match(out, new RegExp(`src="https://raw\\.githubusercontent\\.com/MemberJunction/MJ/${SHA}/MJ_logo\\.webp"`));
  const link = rewriteHtmlValue('<a href="./guides/CACHING_AND_PUBSUB_GUIDE.md">x</a>', ctx);
  assert.equal(link, '<a href="../guides/caching-and-pubsub/">x</a>');
});

test('transformRepoMarkdown extracts title, keeps GFM tables, rewrites links', () => {
  const ctx = makeCtx();
  const source = [
    '# The Caching Guide',
    '',
    'Intro paragraph about caching.',
    '',
    '| A | B |',
    '|---|---|',
    '| 1 | [dash](./DASHBOARD_BEST_PRACTICES.md) |',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
  ].join('\n');
  const { title, description, body } = transformRepoMarkdown(source, ctx);
  assert.equal(title, 'The Caching Guide');
  assert.equal(description, 'Intro paragraph about caching.');
  assert.doesNotMatch(body, /# The Caching Guide/);
  assert.match(body, /\| *A *\| *B *\|/);
  assert.match(body, /\(\.\.\/dashboard\/\)/);
  assert.match(body, /```mermaid/);
});

test('frontmatter escapes special characters safely', () => {
  const fm = buildFrontmatter({ title: 'A "quoted": title', sidebarLabel: 'X', sidebarOrder: 0 });
  assert.match(fm, /title: "A \\"quoted\\": title"/);
  assert.match(fm, /label: "X"/);
  assert.match(fm, /order: 0/);
});

test('description truncates long first paragraphs', () => {
  const tree = {
    children: [{ type: 'paragraph', children: [{ type: 'text', value: 'word '.repeat(100) }] }],
  };
  const description = extractDescription(tree);
  assert.ok(description.length <= 200);
  assert.match(description, /…$/);
});
