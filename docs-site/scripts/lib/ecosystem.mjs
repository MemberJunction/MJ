/**
 * Build-time GitHub fetch for the /ecosystem page. Network access is
 * deliberately confined to this module and invoked from one obvious call
 * site in ingest.mjs.
 *
 * Fail-soft by design: any per-repo failure degrades that repo's card to
 * name + GitHub link and emits a warning. The docs build must never fail
 * because a sibling repo or the GitHub API is unavailable.
 */

const ORG = 'MemberJunction';
const FETCH_TIMEOUT_MS = 10_000;
const EXCERPT_WORDS = 60;

/**
 * Ecosystem repos surfaced on the docs site. `extraLinks` carries pointers to
 * a repo's own dedicated docs (wiki, hosted docs, …) rendered as
 * "For more info →" links — add entries here as repos grow their own docs.
 */
export const ECOSYSTEM_SOURCES = [
  { repo: 'Skyway', extraLinks: [] },
  { repo: 'Forge', extraLinks: [{ label: 'Forge Wiki', url: 'https://github.com/MemberJunction/Forge/wiki' }] },
  { repo: 'VSCode', extraLinks: [] },
  { repo: 'bizapps-common', extraLinks: [] },
];

/** Fetch card data for every ecosystem repo. Never throws. */
export async function fetchEcosystem(token, warn) {
  return Promise.all(ECOSYSTEM_SOURCES.map((source) => fetchEcosystemRepo(source, token, warn)));
}

async function fetchEcosystemRepo(source, token, warn) {
  const fallback = {
    repo: source.repo,
    htmlUrl: `https://github.com/${ORG}/${source.repo}`,
    description: '',
    excerpt: '',
    release: null,
    extraLinks: source.extraLinks,
  };
  try {
    const [meta, release, readme] = await Promise.all([
      githubJson(`/repos/${ORG}/${source.repo}`, token),
      githubJson(`/repos/${ORG}/${source.repo}/releases/latest`, token).catch(() => null),
      githubRaw(`https://raw.githubusercontent.com/${ORG}/${source.repo}/HEAD/README.md`).catch(() => ''),
    ]);
    return {
      ...fallback,
      description: meta.description ?? '',
      excerpt: excerptFromReadme(readme),
      release: release ? { tag: release.tag_name, date: release.published_at?.slice(0, 10) ?? '' } : null,
    };
  } catch (error) {
    warn(`ecosystem: could not fetch ${ORG}/${source.repo} (${error.message}); rendering minimal card`);
    return fallback;
  }
}

async function githubJson(path, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function githubRaw(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

/** First ~60 words of prose: badges, images, HTML, headings, and code stripped. */
export function excerptFromReadme(markdown) {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s.*$/gm, ' ')
    .replace(/[*_`>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = prose.split(' ').filter(Boolean);
  if (words.length === 0) return '';
  const clipped = words.slice(0, EXCERPT_WORDS).join(' ');
  return words.length > EXCERPT_WORDS ? `${clipped}…` : clipped;
}
