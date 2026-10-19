/**
 * Build-time GitHub reads for the BizApps catalog. Like ecosystem.mjs, all
 * network access for this feature is confined to this module.
 *
 * Two failure modes, deliberately different:
 *   - DISCOVERY (listing the org's repos) throws. Without it there is no
 *     catalog, and the caller decides what to do: ingest falls back to the
 *     committed guides/BIZAPPS_GUIDE.md, the refresh CLI exits non-zero so it
 *     never commits an empty guide.
 *   - Everything per-repo is fail-soft: a manifest or featured repo that cannot
 *     be read degrades that one entry and emits a warning.
 *
 * Reads go through the REST API (`contents` with the raw media type) rather than
 * raw.githubusercontent.com so one token covers them and they are rate-limited
 * as one budget: about 2 calls per BizApp with GITHUB_TOKEN's 1,000/hour.
 */
import { readFileSync } from 'node:fs';
import { BIZAPPS_REPO_PATTERN, FEATURED_REPOS, ORG } from './bizapps-catalog.mjs';

const API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** The branch every BizApp releases from; a manifest there is the released state. */
const RELEASE_BRANCH = 'main';

/**
 * Discover the public BizApps and read everything the catalog needs.
 *
 * @param {{ token?: string, fetchImpl?: typeof fetch, warn?: (message: string) => void }} options
 * @returns {Promise<{ org: string, repos: Array<{ repo: object, manifest: object|null }>, featured: Array<object> }>}
 */
export async function fetchBizAppsSource({ token, fetchImpl = globalThis.fetch, warn = () => {} } = {}) {
  const client = createClient(token, fetchImpl);
  const repos = (await listOrgRepos(client)).filter(isPublicBizApp);
  if (repos.length === 0) {
    throw new Error(`no public ${BIZAPPS_REPO_PATTERN} repositories found in ${ORG}`);
  }
  const [apps, featured] = await Promise.all([
    Promise.all(repos.map(async (repo) => ({ repo: pickRepo(repo), manifest: await readManifest(client, repo, warn) }))),
    Promise.all(FEATURED_REPOS.map((config) => readFeatured(client, config, warn))),
  ]);
  return { org: ORG, repos: apps, featured: featured.filter(Boolean) };
}

/**
 * The source both callers use: a saved source file when one is given (the
 * BIZAPPS_SOURCE_FILE env var / `--source` flag — offline previews and tests),
 * otherwise GitHub. A saved file is exactly what fetchBizAppsSource returns, as
 * written by `bizapps-guide.mjs --save-source`.
 */
export async function loadBizAppsSource({ file, token, fetchImpl, warn } = {}) {
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  return fetchBizAppsSource({ token, fetchImpl, warn });
}

/** Public, live, original: archived repos and forks are not BizApps. */
export function isPublicBizApp(repo) {
  return (
    BIZAPPS_REPO_PATTERN.test(repo.name) &&
    repo.private === false &&
    (repo.visibility === undefined || repo.visibility === 'public') &&
    !repo.archived &&
    !repo.fork
  );
}

function pickRepo(repo) {
  return {
    name: repo.name,
    html_url: repo.html_url,
    description: repo.description ?? '',
    default_branch: repo.default_branch ?? RELEASE_BRANCH,
  };
}

async function listOrgRepos(client) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await client.json(`/orgs/${ORG}/repos?type=public&per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`unexpected response listing ${ORG} repositories`);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
  }
  throw new Error(`${ORG} has more than ${PAGE_SIZE * MAX_PAGES} public repositories; raise MAX_PAGES`);
}

/**
 * mj-app.json from the release branch, else the default branch. Returns
 * `{ ref, manifest }` with `manifest: null` when the repo has none,
 * or `{ ref: null, manifest: null, error }` when it could not be read.
 */
async function readManifest(client, repo, warn) {
  const refs = [...new Set([RELEASE_BRANCH, repo.default_branch ?? RELEASE_BRANCH])];
  for (const ref of refs) {
    let text;
    try {
      text = await client.raw(`/repos/${ORG}/${repo.name}/contents/mj-app.json?ref=${encodeURIComponent(ref)}`);
    } catch (error) {
      warn(`bizapps: could not read ${repo.name}/mj-app.json@${ref} (${error.message})`);
      return { ref: null, manifest: null, error: error.message };
    }
    if (text === null) continue;
    try {
      return { ref, manifest: JSON.parse(text) };
    } catch (error) {
      warn(`bizapps: ${repo.name}/mj-app.json@${ref} is not valid JSON (${error.message})`);
      return { ref: null, manifest: null, error: error.message };
    }
  }
  return { ref: null, manifest: null };
}

/**
 * GitHub data for a featured repo, keyed by `name`. The curated half (title,
 * kind, links, …) is NOT copied in: buildCatalog joins it from FEATURED_REPOS,
 * so a saved source never pins an old copy of the config. Missing or
 * no-longer-public repos are dropped; read errors keep the configured card.
 */
async function readFeatured(client, config, warn) {
  let repo;
  try {
    repo = await client.json(`/repos/${ORG}/${config.repo}`, { allowMissing: true });
  } catch (error) {
    warn(`bizapps: could not read featured repo ${ORG}/${config.repo} (${error.message}); using its configured description`);
    return { name: config.repo, repo: null, manifest: null };
  }
  if (!repo || repo.private !== false || repo.archived) {
    warn(`bizapps: featured repo ${ORG}/${config.repo} is missing, private or archived; leaving it out`);
    return null;
  }
  // Only an Open App (More Cheese) has a manifest worth a call: its description and the BizApps it builds on.
  const manifest = config.descriptionFrom === 'manifest' ? await readManifest(client, repo, warn) : null;
  return { name: config.repo, repo: pickRepo(repo), manifest };
}

function createClient(token, fetchImpl) {
  const request = async (path, accept) => {
    const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mj-docs-site' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetchImpl(`${API}${path}`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  };
  return {
    /** Parsed JSON; null for a 404 when `allowMissing`, otherwise any non-2xx throws. */
    async json(path, { allowMissing = false } = {}) {
      const res = await request(path, 'application/vnd.github+json');
      if (res.status === 404 && allowMissing) return null;
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      return res.json();
    },
    /** File body as text; null for a 404 (no such file on that ref). */
    async raw(path) {
      const res = await request(path, 'application/vnd.github.raw+json');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      return res.text();
    },
  };
}
