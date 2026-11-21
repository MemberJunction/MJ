/**
 * The BizApps catalog model: which MemberJunction business applications exist,
 * what each one is for, and how they build on each other. Pure — no I/O. The
 * network half lives in bizapps-source.mjs; the two renderers are the
 * BizAppsCatalog.astro component (docs site) and bizapps-markdown.mjs
 * (guides/BIZAPPS_GUIDE.md on GitHub).
 *
 * What is in the catalog is DISCOVERED, never listed: every public, non-archived
 * repository in the MemberJunction org whose name starts with `bizapps-`. A new
 * BizApp appears on the next build with no change here. Everything an app says
 * about itself (name, description, schema, packages, dependencies) comes from
 * its own mj-app.json.
 *
 * Only two things are hand-maintained, and both are below: FEATURED_REPOS (the
 * "Also in the MemberJunction org" section, which is curated on purpose) and
 * STORIES (cross-app narratives a manifest cannot express).
 */

export const ORG = 'MemberJunction';

/** A repo is a BizApp when its name matches this AND it is public, not archived, not a fork. */
export const BIZAPPS_REPO_PATTERN = /^bizapps-[a-z0-9][a-z0-9-]*$/i;

/** The committed GitHub copy, and the slug the docs site serves it at. */
export const GUIDE_SOURCE = 'guides/BIZAPPS_GUIDE.md';
export const GUIDE_SLUG = 'guides/bizapps';

/**
 * Unprefixed on purpose: docs.memberjunction.org forwards an unversioned path into
 * the newest LTS documentation set, so this link survives version bumps.
 */
export const DOCS_PAGE_URL = 'https://docs.memberjunction.org/guides/bizapps/';

/**
 * Repos shown BELOW the catalog. Known and linked, never auto-included: adding one
 * is a deliberate edit here. Where the description comes from:
 *   'manifest'  the repo's own mj-app.json (More Cheese is an Open App; its GitHub
 *               description is not useful), falling back to `description`
 *   'repo'      the GitHub repository description, falling back to `description`
 *   'config'    `description` as written here
 * An Open App's icon and color come from its manifest; `icon` here is for repos without one.
 */
export const FEATURED_REPOS = [
  {
    repo: 'more-cheese',
    title: 'More Cheese',
    kind: 'Demo association',
    highlight: true,
    descriptionFrom: 'manifest',
    description:
      'The MoreCheese demo association (International Cheese Federation): a generated, causally-consistent dataset demonstrating the MJ platform across composed BizApps.',
    links: [],
  },
  {
    repo: 'loom',
    title: 'Loom',
    kind: 'Data simulation engine',
    descriptionFrom: 'config',
    description:
      'Deterministic, causal business-world and data simulation engine for MemberJunction. It generates the connected, realistic data behind demos such as More Cheese.',
    icon: 'fa-solid fa-diagram-project',
    links: [],
  },
  {
    repo: 'Forge',
    title: 'Forge',
    kind: 'Desktop SQL IDE',
    descriptionFrom: 'config',
    description: 'An AI-native SQL IDE for SQL Server, PostgreSQL, and MySQL, on macOS and Windows.',
    icon: 'fa-solid fa-database',
    links: [
      { label: 'Download', url: 'https://github.com/MemberJunction/Forge/releases/latest' },
      { label: 'Wiki', url: 'https://github.com/MemberJunction/Forge/wiki' },
    ],
  },
];

/**
 * Cross-app flows. A story is dropped (with a warning) if any app in it is no
 * longer in the catalog, so a renamed or retired repo cannot leave a dead flow behind.
 */
export const STORIES = [
  {
    id: 'quote-to-cash',
    title: 'Quote to cash',
    steps: [
      { repo: 'bizapps-sales', label: 'Deal' },
      { repo: 'bizapps-contracts', label: 'Agreement' },
      { repo: 'bizapps-orders', label: 'Order, payment & subscription' },
      { repo: 'bizapps-accounting', label: 'Journal entries' },
    ],
    end: 'Your ERP',
    summary:
      'A won deal becomes a signed agreement, then an order with its payments and subscriptions, then balanced journal entries that batch to the ERP that owns your general ledger. Sales records intent and never computes money; Orders prices and bills; Accounting is the subledger, not the general ledger.',
  },
];

/** MJ guides both renderings point to. Paths are repo-relative; each renderer turns them into links. */
export const RELATED_GUIDES = [
  { src: 'guides/BUILDING_APPS_ON_MJ.md', label: 'Building Applications on MemberJunction' },
  { src: 'guides/DEV_WORKSPACE_QUICKSTART.md', label: 'Dev Workspace Quickstart', note: 'develop several apps side by side' },
  { src: 'guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md', label: 'Release Metadata Migrations', note: 'how an Open App ships its metadata' },
];

/** Names of the layers the map is drawn in. Layer 0 has no BizApp dependencies. */
export function layerLabel(layer) {
  return layer === 0 ? 'Foundation' : `Level ${layer}`;
}

/**
 * Build the catalog from raw source data (see bizapps-source.mjs for the shape).
 * Deterministic for a given input: apps sort by name, every list sorts, so the
 * GitHub copy only changes when an app actually changes.
 *
 * @param {{ org?: string, repos: Array<object>, featured?: Array<object> }} source
 * @param {(message: string) => void} [warn]
 */
export function buildCatalog(source, warn = () => {}) {
  const apps = source.repos.map(toApp).sort(compareApps);
  const byId = new Map(apps.map((app) => [app.id, app]));
  const byManifestName = new Map(apps.filter((app) => app.manifestName).map((app) => [app.manifestName.toLowerCase(), app]));
  const declared = new Map(source.repos.map((entry) => [entry.repo.name.toLowerCase(), normalizeDependencies(entry.manifest?.manifest)]));

  for (const app of apps) {
    for (const dep of declared.get(app.id) ?? []) {
      const target = resolveDependency(dep, byId, byManifestName);
      if (target && target.id !== app.id) {
        if (!app.dependsOn.includes(target.id)) app.dependsOn.push(target.id);
        checkRange(app, dep, target, warn);
      } else if (!target) {
        app.dependsOnExternal.push({ name: dep.name, range: dep.range });
      }
    }
    app.dependsOn.sort();
    app.dependsOnExternal.sort((a, b) => a.name.localeCompare(b.name));
  }
  for (const app of apps) {
    for (const depId of app.dependsOn) byId.get(depId).usedBy.push(app.id);
  }
  for (const app of apps) app.usedBy.sort();

  const layers = assignLayers(apps, byId, warn);
  const edges = buildEdges(apps, byId);

  return {
    org: source.org ?? ORG,
    apps,
    layers,
    edges,
    stories: resolveStories(byId, warn),
    featured: resolveFeatured(source.featured ?? [], byId, byManifestName),
  };
}

function toApp(entry) {
  const { repo, manifest: read } = entry;
  const manifest = read?.manifest ?? null;
  const id = repo.name.toLowerCase();
  const version = typeof manifest?.version === 'string' ? manifest.version : null;
  const released = Boolean(read?.ref === 'main' && version && version !== '0.0.0');
  const description = clean(manifest?.description) || clean(repo.description);
  return {
    id,
    repo: repo.name,
    name: shortName(manifest?.displayName, repo.name),
    manifestName: typeof manifest?.name === 'string' ? manifest.name : null,
    description,
    summary: summarize(description),
    repoUrl: repo.html_url ?? `https://github.com/${ORG}/${repo.name}`,
    manifestUrl: read?.ref ? `${repo.html_url ?? `https://github.com/${ORG}/${repo.name}`}/blob/${read.ref}/mj-app.json` : null,
    status: manifestStatus(read, released),
    version: released ? version : null,
    schema: schemaName(manifest?.schema),
    icon: iconClass(manifest?.icon),
    color: hexColor(manifest?.color),
    categories: Array.isArray(manifest?.categories) ? manifest.categories.filter((c) => typeof c === 'string') : [],
    packages: packageList(manifest?.packages),
    mjVersionRange: typeof manifest?.mjVersionRange === 'string' ? manifest.mjVersionRange : null,
    dependsOn: [],
    dependsOnExternal: [],
    usedBy: [],
    layer: 0,
  };
}

/**
 * released        the manifest is on `main` (every BizApp's release branch) at a real version
 * in-development  the manifest exists only on the default branch, or main still says 0.0.0
 * no-manifest     the repo has no mj-app.json yet
 * unavailable     the manifest could not be read at build time (network / API error)
 */
function manifestStatus(read, released) {
  if (released) return 'released';
  if (read?.error) return 'unavailable';
  if (!read?.manifest) return 'no-manifest';
  return 'in-development';
}

/** 'BizApps Accounting' -> 'Accounting', 'MJ Forms' -> 'Forms'; falls back to the repo name. */
export function shortName(displayName, repoName) {
  const fromManifest = clean(displayName).replace(/^(BizApps|MJ)\s+/i, '');
  if (fromManifest) return fromManifest;
  return repoName
    .replace(/^bizapps-/i, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const SUMMARY_MAX = 170;

/**
 * One line for tables and the map caption: the first sentence, cut at a word
 * boundary if it is still long. Manifest descriptions run from one clause to a
 * paragraph; the full text is always shown on the app's own card.
 */
export function summarize(text) {
  if (!text) return '';
  const first = text.match(/^(.+?[.!?])(?=\s|$)/)?.[1] ?? text;
  if (first.length <= SUMMARY_MAX) return first;
  const cut = first.slice(0, SUMMARY_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > SUMMARY_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/, '')}…`;
}

function compareApps(a, b) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** mj-app.json `icon`: a Font Awesome class list such as "fa-solid fa-cart-shopping". */
function iconClass(icon) {
  return typeof icon === 'string' && /\bfa-[a-z0-9-]+/.test(icon) ? icon.trim() : null;
}

/** mj-app.json `color`: #RRGGBB per MJ's manifest schema; anything else is ignored. */
function hexColor(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null;
}

function schemaName(schema) {
  if (typeof schema === 'string') return schema;
  if (schema && typeof schema.name === 'string') return schema.name;
  return null;
}

const TIERS = ['server', 'client', 'shared'];

function packageList(packages) {
  if (!packages || typeof packages !== 'object') return [];
  const list = [];
  for (const tier of TIERS) {
    for (const pkg of Array.isArray(packages[tier]) ? packages[tier] : []) {
      if (pkg && typeof pkg.name === 'string') list.push({ name: pkg.name, tier, role: typeof pkg.role === 'string' ? pkg.role : null });
    }
  }
  return list;
}

/**
 * mj-app.json allows two dependency shapes (MJ's manifest schema normalizes the
 * array form into the map form): `{ "<app>": { version, repository } }` and
 * `[{ name, versionRange, repository }]`.
 */
export function normalizeDependencies(manifest) {
  const deps = manifest?.dependencies;
  if (!deps) return [];
  if (Array.isArray(deps)) {
    return deps
      .filter((d) => d && typeof d.name === 'string')
      .map((d) => ({ name: d.name, range: d.versionRange ?? d.version ?? null, repository: d.repository ?? null }));
  }
  if (typeof deps === 'object') {
    return Object.entries(deps).map(([name, d]) => ({ name, range: d?.version ?? d?.versionRange ?? null, repository: d?.repository ?? null }));
  }
  return [];
}

/** Repository URL first (unambiguous), then the dependency's app name. */
function resolveDependency(dep, byId, byManifestName) {
  const match = typeof dep.repository === 'string' ? dep.repository.match(/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i) : null;
  if (match && match[1].toLowerCase() === ORG.toLowerCase()) {
    const app = byId.get(match[2].toLowerCase());
    if (app) return app;
  }
  return byManifestName.get(dep.name.toLowerCase()) ?? null;
}

/** Longest-path layering: an app sits one level above its highest dependency. */
function assignLayers(apps, byId, warn) {
  const memo = new Map();
  const visiting = new Set();
  const depth = (app) => {
    if (memo.has(app.id)) return memo.get(app.id);
    if (visiting.has(app.id)) {
      warn(`bizapps: dependency cycle through ${app.repo}; placing it at the foundation`);
      return 0;
    }
    visiting.add(app.id);
    const level = app.dependsOn.length === 0 ? 0 : 1 + Math.max(...app.dependsOn.map((id) => depth(byId.get(id))));
    visiting.delete(app.id);
    memo.set(app.id, level);
    return level;
  };
  const layers = [];
  for (const app of apps) {
    app.layer = depth(app);
    (layers[app.layer] ??= []).push(app.id);
  }
  // Array.from, not .map: a level with no apps is a hole, and .map skips holes.
  return Array.from(layers, (ids) => ids ?? []);
}

/**
 * One edge per declared dependency, flagged `implied` when another path already
 * connects the two apps (Sales -> Orders -> Accounting implies Sales -> Accounting).
 * The map draws only the direct ones; the cards still list everything declared.
 */
function buildEdges(apps, byId) {
  const reach = new Map();
  const reachable = (id, seen = new Set()) => {
    if (reach.has(id)) return reach.get(id);
    const out = new Set();
    for (const dep of byId.get(id).dependsOn) {
      if (seen.has(dep)) continue;
      out.add(dep);
      for (const transitive of reachable(dep, new Set([...seen, id]))) out.add(transitive);
    }
    reach.set(id, out);
    return out;
  };
  const edges = [];
  for (const app of apps) {
    for (const dep of app.dependsOn) {
      const implied = app.dependsOn.some((other) => other !== dep && reachable(other).has(dep));
      edges.push({ from: dep, to: app.id, implied });
    }
  }
  return edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

function resolveStories(byId, warn) {
  const stories = [];
  for (const story of STORIES) {
    const missing = story.steps.filter((step) => !byId.has(step.repo));
    if (missing.length > 0) {
      warn(`bizapps: dropping story "${story.id}"; not in the catalog: ${missing.map((s) => s.repo).join(', ')}`);
      continue;
    }
    stories.push({ ...story, steps: story.steps.map((step) => ({ ...step, name: byId.get(step.repo).name })) });
  }
  return stories;
}

/** FEATURED_REPOS in their configured order, each joined to whatever GitHub returned for it. */
function resolveFeatured(entries, byId, byManifestName) {
  const byName = new Map(entries.filter((e) => e && typeof e.name === 'string').map((e) => [e.name.toLowerCase(), e]));
  return FEATURED_REPOS.filter((config) => byName.has(config.repo.toLowerCase())).map((config) =>
    toFeatured(config, byName.get(config.repo.toLowerCase()), byId, byManifestName),
  );
}

/**
 * A featured repo, plus — for an Open App such as More Cheese — the BizApps it
 * builds on. Dependencies outside the catalog are left off on purpose: the
 * catalog is the public BizApps, and this section points back into it.
 */
function toFeatured(config, entry, byId, byManifestName) {
  const manifest = entry.manifest?.manifest ?? null;
  const live =
    config.descriptionFrom === 'manifest' ? clean(manifest?.description) : config.descriptionFrom === 'repo' ? clean(entry.repo?.description) : '';
  const composes = normalizeDependencies(manifest)
    .map((dep) => resolveDependency(dep, byId, byManifestName))
    .filter(Boolean)
    .map((app) => app.id);
  return {
    id: config.repo.toLowerCase(),
    repo: config.repo,
    title: config.title,
    kind: config.kind,
    highlight: Boolean(config.highlight),
    description: live || config.description,
    icon: iconClass(manifest?.icon) ?? iconClass(config.icon),
    color: hexColor(manifest?.color) ?? hexColor(config.color),
    repoUrl: entry.repo?.html_url ?? `https://github.com/${ORG}/${config.repo}`,
    links: config.links ?? [],
    composes: [...new Set(composes)].sort(),
  };
}

// ── Dependency-range health ─────────────────────────────────────────────────
// Reported as build warnings, never rendered: a declared range that the
// dependency's released version does not satisfy means the two cannot be
// installed together at their current releases.

function checkRange(app, dep, target, warn) {
  if (app.status !== 'released' || target.status !== 'released' || !dep.range || !target.version) return;
  if (satisfiesRange(target.version, dep.range) === false) {
    warn(`bizapps: ${app.repo} requires ${dep.name} ${dep.range}, but ${target.repo} is released at ${target.version}`);
  }
}

/**
 * Minimal semver range check for the shapes mj-app.json uses (`>=a <b`, `^a`, `~a`,
 * `||`). Returns null when it cannot parse the range: unknown is not a failure.
 */
export function satisfiesRange(version, range) {
  const v = parseVersion(version);
  if (!v) return null;
  let anyParsed = false;
  for (const alternative of range.split('||')) {
    const comparators = alternative.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 0) continue;
    let ok = true;
    for (const comparator of comparators) {
      const result = testComparator(v, comparator);
      if (result === null) return null;
      ok &&= result;
    }
    anyParsed = true;
    if (ok) return true;
  }
  return anyParsed ? false : null;
}

function testComparator(v, comparator) {
  const m = comparator.match(/^(>=|<=|>|<|=|\^|~)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  if (!m) return null;
  const op = m[1] ?? '=';
  const target = parseVersion(m[2]);
  const cmp = compareVersions(v, target);
  switch (op) {
    case '>=': return cmp >= 0;
    case '>': return cmp > 0;
    case '<=': return cmp <= 0;
    case '<': return cmp < 0;
    case '=': return cmp === 0;
    case '^': {
      const upper = target.major > 0 ? [target.major + 1, 0, 0] : target.minor > 0 ? [0, target.minor + 1, 0] : [0, 0, target.patch + 1];
      return cmp >= 0 && compareVersions(v, { major: upper[0], minor: upper[1], patch: upper[2], pre: [] }) < 0;
    }
    case '~':
      return cmp >= 0 && compareVersions(v, { major: target.major, minor: target.minor + 1, patch: 0, pre: [] }) < 0;
    default:
      return null;
  }
}

function parseVersion(value) {
  const m = String(value).match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] };
}

/** Semver precedence, prerelease included (1.0.0-edge.2 < 1.0.0). */
function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (a.pre[i] === undefined) return -1;
    if (b.pre[i] === undefined) return 1;
    const an = /^\d+$/.test(a.pre[i]);
    const bn = /^\d+$/.test(b.pre[i]);
    if (an && bn && Number(a.pre[i]) !== Number(b.pre[i])) return Number(a.pre[i]) - Number(b.pre[i]);
    if (an !== bn) return an ? -1 : 1;
    if (a.pre[i] !== b.pre[i]) return a.pre[i] < b.pre[i] ? -1 : 1;
  }
  return 0;
}
