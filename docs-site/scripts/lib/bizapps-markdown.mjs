/**
 * Renders the BizApps catalog as GitHub-flavored markdown: the committed
 * guides/BIZAPPS_GUIDE.md. Pure — no I/O.
 *
 * Deliberately low-churn: no versions, dates, stars or anything else that moves
 * on every release. The file only changes when an app is added or retired, or
 * when an app changes what it says about itself (description, schema, packages,
 * dependencies). Versions and the interactive map live on the docs-site page,
 * which is rebuilt on every docs deploy and is never committed.
 */
import { DOCS_PAGE_URL, ORG, RELATED_GUIDES, layerLabel } from './bizapps-catalog.mjs';

const STATUS_TEXT = {
  released: 'Released',
  'in-development': 'In development',
  'no-manifest': 'In development (no `mj-app.json` yet)',
  unavailable: 'Unknown (manifest could not be read)',
};

/** @param {ReturnType<import('./bizapps-catalog.mjs').buildCatalog>} catalog */
export function renderGuideMarkdown(catalog) {
  const byId = new Map(catalog.apps.map((app) => [app.id, app]));
  const anchors = headingAnchors(catalog);
  const link = (id) => `[${byId.get(id).name}](#${anchors.get(id)})`;
  const sections = [
    header(),
    intro(catalog),
    map(catalog, byId),
    glance(catalog, link),
    stories(catalog, link),
    apps(catalog, link),
    featured(catalog, link),
    about(),
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

function header() {
  return [
    '<!--',
    '  GENERATED FILE. Do not edit by hand: your change would be overwritten by the next refresh.',
    `  Source: every public \`bizapps-*\` repository in the ${ORG} GitHub organization, read from its mj-app.json.`,
    '  Regenerate:  node docs-site/scripts/bizapps-guide.mjs',
    '  Hand-written parts (featured repos, stories, this page\'s prose): docs-site/scripts/lib/bizapps-catalog.mjs',
    '  and docs-site/scripts/lib/bizapps-markdown.mjs.',
    '-->',
    '',
    '# MemberJunction BizApps',
  ].join('\n');
}

function intro(catalog) {
  const released = catalog.apps.filter((app) => app.status === 'released').length;
  return [
    `BizApps are the business applications built on MemberJunction. There are **${catalog.apps.length}** in the public catalog (${released} released, ${catalog.apps.length - released} in development). Each one is an MJ **Open App**: its own repository, database schema and npm packages, installed into any MJ instance with \`mj app install\`, which installs the apps it builds on first.`,
    '',
    `This page lists every public \`bizapps-*\` repository in the [${ORG} GitHub organization](https://github.com/${ORG}) and is generated from each app's \`mj-app.json\`, so it follows the apps rather than a hand-kept list.`,
    '',
    `> **Interactive version:** [docs.memberjunction.org → BizApps](${DOCS_PAGE_URL}) adds the current release of each app and a map you can explore.`,
  ].join('\n');
}

function map(catalog, byId) {
  const nodeId = (id) => id.replace(/[^a-zA-Z0-9]/g, '_');
  const lines = ['## The map', '', '```mermaid', 'flowchart LR'];
  catalog.layers.forEach((ids, layer) => {
    lines.push(`  subgraph layer${layer}["${layerLabel(layer)}"]`);
    for (const id of ids) lines.push(`    ${nodeId(id)}["${mermaidText(byId.get(id).name)}"]`);
    lines.push('  end');
  });
  for (const edge of catalog.edges.filter((e) => !e.implied)) lines.push(`  ${nodeId(edge.from)} --> ${nodeId(edge.to)}`);
  const inDevelopment = catalog.apps.filter((app) => app.status !== 'released').map((app) => nodeId(app.id));
  if (inDevelopment.length > 0) {
    lines.push('  classDef dev stroke-dasharray: 5 4');
    lines.push(`  class ${inDevelopment.join(',')} dev`);
  }
  lines.push('```', '');
  lines.push(
    'An arrow points from an app to the apps that build on it. Only direct links are drawn: when Sales builds on Orders and Orders builds on Accounting, there is no separate arrow from Accounting to Sales. Each app below lists everything it declares. A dashed box is an app still in development.',
  );
  lines.push('', '**Read left to right:**', '');
  catalog.layers.forEach((ids, layer) => {
    lines.push(`- **${layerLabel(layer)}:** ${ids.map((id) => byId.get(id).name).join(', ')}`);
  });
  return lines.join('\n');
}

function glance(catalog, link) {
  const lines = ['## At a glance', '', '| App | What it does | Builds on | Status |', '|---|---|---|---|'];
  for (const app of catalog.apps) {
    const buildsOn = app.dependsOn.length > 0 ? app.dependsOn.map(link).join(', ') : '—';
    lines.push(`| ${link(app.id)} | ${cell(app.summary) || '—'} | ${buildsOn} | ${app.status === 'released' ? 'Released' : 'In development'} |`);
  }
  return lines.join('\n');
}

function stories(catalog, link) {
  if (catalog.stories.length === 0) return '';
  const lines = ['## How they fit together'];
  for (const story of catalog.stories) {
    const flow = story.steps.map((step) => `${link(step.repo)} (${step.label.toLowerCase()})`);
    if (story.end) flow.push(story.end);
    lines.push('', `### ${story.title}`, '', flow.join(' → '), '', story.summary);
  }
  return lines.join('\n');
}

function apps(catalog, link) {
  const lines = ['## The apps'];
  for (const app of catalog.apps) {
    lines.push('', `### ${app.name}`, '');
    if (app.description) lines.push(text(app.description), '');
    lines.push(`- **Repository:** [${ORG}/${app.repo}](${app.repoUrl})`);
    lines.push(`- **Status:** ${STATUS_TEXT[app.status]}`);
    if (app.schema) lines.push(`- **Database schema:** \`${app.schema}\``);
    lines.push(`- **Builds on:** ${app.dependsOn.length > 0 ? app.dependsOn.map(link).join(', ') : 'MemberJunction core only'}`);
    if (app.dependsOnExternal.length > 0) {
      lines.push(`- **Also requires (outside this catalog):** ${app.dependsOnExternal.map((d) => `\`${d.name}\``).join(', ')}`);
    }
    if (app.usedBy.length > 0) lines.push(`- **Used by:** ${app.usedBy.map(link).join(', ')}`);
    if (app.packages.length > 0) {
      lines.push(`- **Packages:** ${app.packages.map((p) => `\`${p.name}\` (${p.tier})`).join(', ')}`);
    }
  }
  return lines.join('\n');
}

function featured(catalog, link) {
  if (catalog.featured.length === 0) return '';
  const lines = [
    `## Also in the ${ORG} org`,
    '',
    'Not BizApps, but worth knowing about. These are picked by hand and are never added to the catalog automatically.',
  ];
  for (const item of catalog.featured) {
    lines.push('', `### ${item.title}`, '', `*${item.kind}.* ${text(item.description)}`, '');
    if (item.composes.length > 0) lines.push(`Builds on ${item.composes.length} BizApps: ${item.composes.map(link).join(', ')}.`, '');
    const links = [`[${ORG}/${item.repo}](${item.repoUrl})`, ...item.links.map((l) => `[${l.label}](${l.url})`)];
    lines.push(links.join(' · '));
  }
  return lines.join('\n');
}

function about() {
  return [
    '## About this page',
    '',
    `**Adding a BizApp:** create a public repository named \`bizapps-<name>\` in the ${ORG} organization with an \`mj-app.json\` at its root. It joins this page on the next refresh and the docs site on its next build; nothing here needs editing. An app counts as released once its \`mj-app.json\` is on the repository's \`main\` branch at a real version.`,
    '',
    '**How it stays current:** the docs site reads the live catalog every time it builds. This copy is refreshed by [`.github/workflows/bizapps-guide.yml`](../.github/workflows/bizapps-guide.yml), which runs after each docs deploy and weekly, and opens a pull request when the catalog has changed.',
    '',
    `Related guides: ${RELATED_GUIDES.map((g) => `[${g.label}](${g.src.replace(/^guides\//, '')})${g.note ? ` (${g.note})` : ''}`).join(' · ')}.`,
  ].join('\n');
}

/**
 * GitHub's heading anchors for each app's `### <name>`, numbered the way GitHub
 * numbers duplicates (`name`, `name-1`, …) across every heading on the page.
 */
function headingAnchors(catalog) {
  const seen = new Map();
  const take = (text) => {
    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
  // Headings in page order, up to and including the per-app ones.
  ['MemberJunction BizApps', 'The map', 'At a glance'].forEach(take);
  if (catalog.stories.length > 0) {
    take('How they fit together');
    catalog.stories.forEach((story) => take(story.title));
  }
  take('The apps');
  return new Map(catalog.apps.map((app) => [app.id, take(app.name)]));
}

export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * Manifest prose is plain text, not markdown: a description that mentions an
 * element (`<mj-secure-messaging>`) must not reach GitHub as raw HTML.
 */
export function text(value) {
  return (value ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cell(value) {
  return text(value).replace(/[\\|]/g, '\\$&').replace(/\s+/g, ' ').trim();
}

function mermaidText(text) {
  return text.replace(/"/g, '#quot;');
}
