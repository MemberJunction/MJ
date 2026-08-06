#!/usr/bin/env node
/**
 * Content ingest for the MemberJunction docs site.
 *
 * Auto-discovers and transforms repo markdown into the Starlight content
 * collection — guides/*.md, every packages/x/README.md, key root docs, the
 * agent-skills catalog, and ecosystem repo cards. Nothing is hand-listed:
 * adding a guide or a package README to the repo adds it to the site on the
 * next build with zero docs-site changes.
 *
 * Run from docs-site/: `npm run ingest` (also runs automatically in
 * `npm run dev` / `npm run build`).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformRepoMarkdown, buildFrontmatter } from './lib/markdown.mjs';
import { compareReleasesDesc, guideSlug, labelFromSlug, packageSlug, relativeSiteLink, releaseSlug, releaseVersion } from './lib/site-map.mjs';
import { fetchEcosystem } from './lib/ecosystem.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CONTENT_ROOT = path.resolve(SCRIPT_DIR, '../src/content/docs');
const EDIT_BASE = 'https://github.com/MemberJunction/MJ/edit/next/';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.angular', 'coverage', '.git']);

/** Everything ingest writes — cleaned before each run, gitignored, never edited. */
const GENERATED_PATHS = [
  'guides',
  'packages',
  'releases',
  'community',
  'overview.md',
  'deployment.md',
  'upgrade-v5.md',
  'upgrade-v6.md',
  'metadata.md',
  'ecosystem.md',
  'ai-and-agents/skills.md',
];

/**
 * Root-level repo docs rendered as top-level site pages.
 * DEPLOYMENT.md is deliberately absent: it is internal release-engineering
 * material, not user documentation. Links to it from rendered pages become
 * SHA-pinned GitHub URLs (the rewriter's treatment of any unrendered file).
 */
const ROOT_DOCS = [
  { src: 'README.md', slug: 'overview', out: 'overview.md', fallbackTitle: 'What is MemberJunction?' },
  { src: 'UPGRADE-v6.0.md', slug: 'upgrade-v6', out: 'upgrade-v6.md', fallbackTitle: 'Upgrading to v6' },
  { src: 'UPGRADE-v5.0.md', slug: 'upgrade-v5', out: 'upgrade-v5.md', fallbackTitle: 'Upgrading to v5' },
  { src: 'CONTRIBUTING.md', slug: 'community/contributing', out: 'community/contributing.md', fallbackTitle: 'Contributing' },
  { src: 'metadata/README.md', slug: 'metadata', out: 'metadata.md', fallbackTitle: 'Metadata System' },
];

/** Guides that are internal ops manuals for MJ maintainers — never rendered on the public site. */
const INTERNAL_GUIDES = new Set(['RELEASE_ENGINEERING_RUNBOOK.md']);

main();

async function main() {
  const warnings = [];
  const warn = (message) => warnings.push(message);
  const sha = resolveBuildSha(warn);

  cleanGeneratedPaths();
  const entries = [...rootDocEntries(), ...guideEntries(), ...packageEntries(warn), ...releaseEntries(warn)];
  const siteMap = new Map(entries.map((e) => [e.src, e.slug]));

  const written = new Map();
  for (const entry of entries) written.set(entry.slug, writeEntry(entry, siteMap, sha, warn));
  writePackagesIndex(entries.filter((e) => e.package));
  writeReleasesIndex(entries.filter((e) => e.release), written);
  writeSkillsPage(sha, warn);
  await writeEcosystemPage(warn);

  report(entries.length, warnings);
}

function resolveBuildSha(warn) {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
    warn('could not resolve a commit SHA (no git, no GITHUB_SHA); pinning GitHub links to "next"');
    return 'next';
  }
}

function cleanGeneratedPaths() {
  for (const rel of GENERATED_PATHS) {
    rmSync(path.join(CONTENT_ROOT, rel), { recursive: true, force: true });
  }
}

function rootDocEntries() {
  return ROOT_DOCS.filter((doc) => existsSync(path.join(REPO_ROOT, doc.src)));
}

function guideEntries() {
  const guidesDir = path.join(REPO_ROOT, 'guides');
  const entries = [];
  for (const name of readdirSync(guidesDir)) {
    if (!name.endsWith('.md') || !statSync(path.join(guidesDir, name)).isFile()) continue;
    if (INTERNAL_GUIDES.has(name)) continue;
    if (name === 'README.md') {
      entries.push({ src: 'guides/README.md', slug: 'guides', out: 'guides/index.md', fallbackTitle: 'Developer Guides', sidebarLabel: 'All Guides', sidebarOrder: 0 });
    } else {
      const slug = `guides/${guideSlug(name)}`;
      entries.push({ src: `guides/${name}`, slug, out: `${slug}.md`, fallbackTitle: labelFromSlug(slug), sidebarLabel: labelFromSlug(slug) });
    }
  }
  return entries;
}

function packageEntries(warn) {
  const entries = [];
  const seen = new Map();
  for (const dirRel of walkPackageDirs('packages')) {
    if (dirRel === 'packages') continue; // the generated Package Directory owns the packages/ index slug
    if (!existsSync(path.join(REPO_ROOT, dirRel, 'README.md'))) continue;
    const slug = packageSlug(dirRel);
    if (seen.has(slug)) {
      warn(`package slug collision: ${dirRel} vs ${seen.get(slug)}; skipping ${dirRel}`);
      continue;
    }
    seen.set(slug, dirRel);
    const meta = readPackageMeta(dirRel);
    entries.push({
      src: `${dirRel}/README.md`,
      slug,
      out: `${dirRel}/index.md`,
      fallbackTitle: meta.name ?? path.basename(dirRel),
      sidebarLabel: path.basename(dirRel),
      package: { group: dirRel.split('/')[1] ?? '', dir: dirRel, ...meta },
    });
  }
  return entries;
}

/**
 * Yields package roots (dirs with a package.json — recursion stops there so
 * internal READMEs like src/__tests__/ never become site pages) and grouping
 * dirs (e.g. packages/AI), whose overview READMEs are also worth rendering.
 */
function* walkPackageDirs(dirRel) {
  yield dirRel;
  if (dirRel !== 'packages' && existsSync(path.join(REPO_ROOT, dirRel, 'package.json'))) return;
  const abs = path.join(REPO_ROOT, dirRel);
  for (const child of readdirSync(abs, { withFileTypes: true })) {
    if (!child.isDirectory() || SKIP_DIRS.has(child.name) || child.name.startsWith('.')) continue;
    yield* walkPackageDirs(`${dirRel}/${child.name}`);
  }
}

/**
 * Release notes: one markdown file per version in releases/ at the repo root
 * (written by the /notes release-coordinator skill). Files are named
 * v<major>.<minor>.<patch>.md; newest versions sort first in the sidebar.
 */
function releaseEntries(warn) {
  const releasesDir = path.join(REPO_ROOT, 'releases');
  if (!existsSync(releasesDir)) return [];
  const files = readdirSync(releasesDir).filter((name) => name.endsWith('.md') && name !== 'README.md');
  for (const name of files) {
    if (releaseVersion(name) === null) warn(`releases: cannot parse a version from "${name}"; it will sort last`);
  }
  return files.sort(compareReleasesDesc).map((name, index) => {
    const version = name.replace(/\.md$/i, '');
    return {
      src: `releases/${name}`,
      slug: `releases/${releaseSlug(name)}`,
      out: `releases/${releaseSlug(name)}.md`,
      fallbackTitle: version,
      titlePrefix: version,
      sidebarLabel: version,
      sidebarOrder: index + 1,
      release: { version },
    };
  });
}

function readPackageMeta(dirRel) {
  const manifestPath = path.join(REPO_ROOT, dirRel, 'package.json');
  if (!existsSync(manifestPath)) return { name: null, description: '', isPrivate: true };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { name: manifest.name ?? null, description: manifest.description ?? '', isPrivate: manifest.private === true };
  } catch {
    return { name: null, description: '', isPrivate: true };
  }
}

function writeEntry(entry, siteMap, sha, warn) {
  const source = readFileSync(path.join(REPO_ROOT, entry.src), 'utf8');
  const ctx = { srcRepoPath: entry.src, currentSlug: entry.slug, siteMap, sha, fileKind: repoFileKind, warn };
  const { title, description, body } = transformRepoMarkdown(source, ctx);
  const pageTitle = composeTitle(entry, title);
  const frontmatter = buildFrontmatter({
    title: pageTitle,
    description,
    editUrl: EDIT_BASE + entry.src,
    sidebarLabel: entry.sidebarLabel,
    sidebarOrder: entry.sidebarOrder,
  });
  writePage(entry.out, frontmatter + body);
  return { title: pageTitle, summary: title, description };
}

/** Releases title as "v5.51.0: <the file's H1 summary>"; everything else uses the H1 (or fallback). */
function composeTitle(entry, extractedTitle) {
  if (entry.titlePrefix) {
    return extractedTitle ? `${entry.titlePrefix}: ${extractedTitle}` : entry.titlePrefix;
  }
  return extractedTitle || entry.fallbackTitle;
}

function repoFileKind(repoPath) {
  try {
    const stats = statSync(path.join(REPO_ROOT, repoPath));
    return stats.isDirectory() ? 'dir' : 'file';
  } catch {
    return null;
  }
}

function writePackagesIndex(packageEntries) {
  const groups = new Map();
  for (const entry of packageEntries) {
    const key = entry.package.group || '(root)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const lines = [
    buildFrontmatter({ title: 'Package Directory', description: 'Every published MemberJunction package, grouped by area.', sidebarLabel: 'Package Directory', sidebarOrder: 0 }),
    'All packages live in [`packages/`](https://github.com/MemberJunction/MJ/tree/next/packages) of the MJ monorepo and publish under the `@memberjunction` npm scope. Each page below renders that package\'s README straight from the repo.',
    '',
  ];
  for (const [group, entries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${group}`, '', '| Package | npm | Description |', '|---|---|---|');
    for (const entry of entries.sort((a, b) => a.slug.localeCompare(b.slug))) {
      const site = relativeSiteLink('packages', entry.slug);
      const npm = entry.package.name && !entry.package.isPrivate ? `[npm](https://www.npmjs.com/package/${entry.package.name})` : '—';
      const label = entry.package.name ?? path.basename(entry.package.dir);
      lines.push(`| [\`${label}\`](${site}) | ${npm} | ${mdCell(entry.package.description)} |`);
    }
    lines.push('');
  }
  writePage('packages/index.md', lines.join('\n'));
}

function mdCell(text) {
  return (text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function writeReleasesIndex(releaseEntries, written) {
  const lines = [
    buildFrontmatter({ title: 'Release Notes', description: 'What changed in each MemberJunction release.', sidebarLabel: 'All Releases', sidebarOrder: 0 }),
    'Release notes live as markdown in [`releases/`](https://github.com/MemberJunction/MJ/tree/next/releases) in the MJ repo — one file per version, published here automatically with each deploy.',
    '',
  ];
  if (releaseEntries.length === 0) {
    lines.push('_Notes will appear here starting with the next release._');
  }
  for (const entry of releaseEntries) {
    const info = written.get(entry.slug);
    const summary = info?.summary ? `: ${info.summary}` : '';
    lines.push(`- **[${entry.release.version}](${relativeSiteLink('releases', entry.slug)})**${summary}`);
  }
  writePage('releases/index.md', lines.join('\n'));
}

function writeSkillsPage(sha, warn) {
  const skillsDir = path.join(REPO_ROOT, '.claude/skills');
  const skills = existsSync(skillsDir) ? readSkills(skillsDir, warn) : [];
  const lines = [
    buildFrontmatter({ title: 'Agent Skills', description: 'Claude Code agent skills published by the MemberJunction project.' }),
    'MemberJunction ships [Claude Code agent skills](https://docs.claude.com/en/docs/claude-code) that teach an AI coding agent repo-specific workflows. Skills are folders containing a `SKILL.md`; to use one in your own project, copy its folder into your project\'s `.claude/skills/` directory.',
    '',
  ];
  if (skills.length === 0) lines.push('_No skills are currently published._');
  for (const skill of skills) {
    lines.push(`## ${skill.name}`, '', skill.description, '', `[Source on GitHub](https://github.com/MemberJunction/MJ/tree/${sha}/.claude/skills/${skill.dir})`, '');
  }
  writePage('ai-and-agents/skills.md', lines.join('\n'));
}

function readSkills(skillsDir, warn) {
  const skills = [];
  for (const name of readdirSync(skillsDir)) {
    const skillFile = path.join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const frontmatter = parseSkillFrontmatter(readFileSync(skillFile, 'utf8'));
    if (!frontmatter.name) {
      warn(`skills: ${name}/SKILL.md has no "name:" in frontmatter; using folder name`);
    }
    skills.push({ dir: name, name: frontmatter.name || name, description: frontmatter.description || '' });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Minimal YAML frontmatter reader for SKILL.md: top-level `key: value` lines only. */
function parseSkillFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  const result = {};
  if (!match) return result;
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

async function writeEcosystemPage(warn) {
  const cards = await fetchEcosystem(process.env.GITHUB_TOKEN, warn);
  const lines = [
    buildFrontmatter({ title: 'Ecosystem', description: 'Sibling MemberJunction repositories: Skyway, Forge, the VSCode extension, and BizApps.' }),
    'MemberJunction is more than this monorepo. These sibling repositories are part of the same ecosystem — each card is fetched from GitHub at build time, so this page never goes stale.',
    '',
  ];
  for (const card of cards) {
    lines.push(`## ${card.repo}`, '');
    if (card.description) lines.push(`> ${card.description}`, '');
    if (card.excerpt) lines.push(card.excerpt, '');
    lines.push(`- [Read on GitHub](${card.htmlUrl})`);
    if (card.release) lines.push(`- Latest release: **${card.release.tag}** (${card.release.date})`);
    for (const link of card.extraLinks) lines.push(`- For more info → [${link.label}](${link.url})`);
    lines.push('');
  }
  lines.push('---', '', 'Browse everything at the [MemberJunction GitHub organization](https://github.com/MemberJunction).');
  writePage('ecosystem.md', lines.join('\n'));
}

function writePage(rel, content) {
  const absolute = path.join(CONTENT_ROOT, rel);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function report(pageCount, warnings) {
  for (const message of warnings) console.warn(`[ingest] WARN ${message}`);
  console.log(`[ingest] generated ${pageCount} pages from repo markdown (+ packages index, skills, ecosystem); ${warnings.length} warning(s)`);
}
