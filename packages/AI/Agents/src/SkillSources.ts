/**
 * @fileoverview Where an external skill comes from, and how to fetch it: parse a URL or GitHub
 * location into a {@link SkillSource}, download its SKILL.md (plus, for GitHub, every other text
 * file in the skill folder), and hash the result so a later check can tell whether upstream moved.
 * No database access; {@link SkillImportExportService} does the persistence.
 *
 * @module @memberjunction/ai-agents
 */
import { createHash } from 'node:crypto';
import type { MJAISkillEntity } from '@memberjunction/core-entities';

/** A skill's upstream: a SKILL.md at a URL, or a skill folder in a GitHub repository at a ref. */
export type SkillSource =
    | { SourceType: 'URL'; URL: string }
    | { SourceType: 'GitHub'; Owner: string; Repo: string; Path: string; Ref: string };

/** A non-SKILL.md file in the skill folder, with its path relative to that folder. */
export interface SkillBundleFile {
    Path: string;
    Content: string;
}

/** Everything fetched from a source: the SKILL.md text, its sibling text files, and what was left out. */
export interface SkillBundle {
    Markdown: string;
    Files: SkillBundleFile[];
    /** Paths not imported (binary, or over {@link MAX_SKILL_FILE_BYTES}), for the caller's warnings. */
    Skipped: string[];
}

/** A GitHub skill folder may hold at most this many files besides SKILL.md. */
export const MAX_SKILL_FILES = 100;
/** Files larger than this are skipped (reported in {@link SkillBundle.Skipped}). */
export const MAX_SKILL_FILE_BYTES = 512 * 1024;

const GITHUB_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com']);
const GITHUB_NAME_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * Parses a source location. `https://github.com/<owner>/<repo>` (optionally `/tree/<ref>/<path>` for a
 * folder or `/blob/<ref>/<path>/SKILL.md` for the file) is a GitHub source; any other https URL is a
 * plain URL source whose body is the SKILL.md. `ref` names the ref when the URL has none (default
 * `HEAD`, the repository's default branch) or when it contains slashes, which a URL cannot delimit.
 */
export function ParseSkillSource(location: string, ref?: string): SkillSource {
    let url: URL;
    try {
        url = new URL(location.trim());
    } catch {
        throw new Error(`Not a valid skill source URL: "${location}"`);
    }
    if (url.protocol !== 'https:') {
        throw new Error(`Skill sources must be https URLs: "${location}"`);
    }
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
        return { SourceType: 'URL', URL: url.toString() };
    }
    return parseGitHubPath(url.pathname.split('/').filter(s => s.length > 0).map(decodeURIComponent), ref);
}

function parseGitHubPath(segments: string[], ref?: string): SkillSource {
    const [owner, rawRepo, kind, ...rest] = segments;
    const repo = rawRepo?.replace(/\.git$/, '');
    if (!owner || !repo || !GITHUB_NAME_RE.test(owner) || !GITHUB_NAME_RE.test(repo)) {
        throw new Error('A GitHub skill source needs https://github.com/<owner>/<repo>');
    }
    if (!kind) {
        return GitHubSkillSource(owner, repo, '', ref ?? 'HEAD');
    }
    if ((kind !== 'tree' && kind !== 'blob') || rest.length === 0) {
        throw new Error('A GitHub skill source must be a repository, a folder (/tree/<ref>/...) or a SKILL.md (/blob/<ref>/...)');
    }
    const split = splitRefAndPath(rest, ref);
    const path = kind === 'blob' ? split.path.split('/').slice(0, -1).join('/') : split.path;
    return GitHubSkillSource(owner, repo, path, split.ref);
}

/** `<ref>/<path>` from a URL. A known `ref` that prefixes the segments wins, so a ref may contain slashes. */
function splitRefAndPath(rest: string[], ref?: string): { ref: string; path: string } {
    const joined = rest.join('/');
    if (ref && (joined === ref || joined.startsWith(`${ref}/`))) {
        return { ref, path: joined.slice(ref.length + 1) };
    }
    return { ref: rest[0], path: rest.slice(1).join('/') };
}

/** Builds a validated GitHub source; `path` is the skill folder relative to the repo root ('' = root). */
export function GitHubSkillSource(owner: string, repo: string, path: string, ref: string): SkillSource {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    if (cleanPath.split('/').some(s => s === '..' || s === '.')) {
        throw new Error(`Invalid skill folder path: "${path}"`);
    }
    if (!ref.trim()) {
        throw new Error('A GitHub skill source needs a ref (tag, branch or commit SHA)');
    }
    return { SourceType: 'GitHub', Owner: owner, Repo: repo, Path: cleanPath, Ref: ref.trim() };
}

/** The URL stored in `AISkill.SourceURL`; for GitHub, a browsable folder link (the ref also goes in `SourceRef`). */
export function SkillSourceURL(source: SkillSource): string {
    if (source.SourceType === 'URL') return source.URL;
    const tail = source.Path ? `/${source.Path}` : '';
    return `https://github.com/${source.Owner}/${source.Repo}/tree/${source.Ref}${tail}`;
}

/** The source recorded on a skill row, or null when the skill has none. */
export function SkillSourceFromSkill(skill: Pick<MJAISkillEntity, 'SourceType' | 'SourceURL' | 'SourceRef'>): SkillSource | null {
    if (!skill.SourceType || !skill.SourceURL) return null;
    if (skill.SourceType === 'URL') return { SourceType: 'URL', URL: skill.SourceURL };
    return ParseSkillSource(skill.SourceURL, skill.SourceRef ?? undefined);
}

/** SHA-256 (lowercase hex) over the SKILL.md and every file, sorted by path, NUL-delimited. */
export function ComputeSkillContentHash(bundle: Pick<SkillBundle, 'Markdown' | 'Files'>): string {
    const hash = createHash('sha256');
    hash.update(`SKILL.md\0${bundle.Markdown}\0`);
    const files = [...bundle.Files].sort((a, b) => (a.Path < b.Path ? -1 : a.Path > b.Path ? 1 : 0));
    for (const file of files) {
        hash.update(`${file.Path}\0${file.Content}\0`);
    }
    return hash.digest('hex');
}

/**
 * The status a scheduled update check should give a sourced skill: `'Pending'` when it is Active and
 * upstream content no longer matches what was imported (an admin reviews before anything changes),
 * otherwise null (leave the row alone). A Pending skill is already awaiting review; a Deprecated one
 * is retired.
 */
export function DecideSkillUpdateStatus(
    skill: Pick<MJAISkillEntity, 'Status' | 'SourceContentHash'>,
    upstreamHash: string
): MJAISkillEntity['Status'] | null {
    if (skill.Status !== 'Active') return null;
    return skill.SourceContentHash?.toLowerCase() === upstreamHash.toLowerCase() ? null : 'Pending';
}

/** Downloads a source. `fetchFn` is injectable for tests; it defaults to the global `fetch`. */
export async function FetchSkillBundle(source: SkillSource, fetchFn: typeof fetch = fetch): Promise<SkillBundle> {
    if (source.SourceType === 'URL') {
        return { Markdown: await fetchText(source.URL, fetchFn), Files: [], Skipped: [] };
    }
    return fetchGitHubBundle(source, fetchFn);
}

async function fetchText(url: string, fetchFn: typeof fetch): Promise<string> {
    const response = await fetchFn(url);
    if (!response.ok) {
        throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

interface GitHubTreeEntry {
    path: string;
    type: string;
    size?: number;
}

interface GitHubTreeResponse {
    tree: GitHubTreeEntry[];
    truncated: boolean;
}

/** One tree listing (a single GitHub API call), then raw downloads of SKILL.md and its sibling files. */
async function fetchGitHubBundle(source: Extract<SkillSource, { SourceType: 'GitHub' }>, fetchFn: typeof fetch): Promise<SkillBundle> {
    const folder = source.Path ? `${source.Path}/` : '';
    const blobs = (await listGitHubTree(source, fetchFn)).filter(e => e.type === 'blob' && e.path.startsWith(folder));
    const skillMd = blobs.find(e => e.path === `${folder}SKILL.md`);
    if (!skillMd) {
        throw new Error(`No SKILL.md found at ${SkillSourceURL(source)}`);
    }
    const others = blobs.filter(e => e !== skillMd);
    const fits = others.filter(e => (e.size ?? 0) <= MAX_SKILL_FILE_BYTES);
    if (fits.length > MAX_SKILL_FILES) {
        throw new Error(`The skill folder has ${fits.length} files; at most ${MAX_SKILL_FILES} are imported`);
    }
    const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
    const rawURL = (path: string) =>
        `https://raw.githubusercontent.com/${source.Owner}/${source.Repo}/${encodePath(source.Ref)}/${encodePath(path)}`;
    const [markdown, ...contents] = await Promise.all([skillMd, ...fits].map(e => fetchText(rawURL(e.path), fetchFn)));
    const files = fits.map((e, i) => ({ Path: e.path.slice(folder.length), Content: contents[i] }));
    const text = files.filter(f => !f.Content.includes('\u0000')); // a NUL byte means binary
    const skipped = others.map(e => e.path.slice(folder.length)).filter(p => !text.some(f => f.Path === p));
    return { Markdown: markdown, Files: text, Skipped: skipped };
}

async function listGitHubTree(source: Extract<SkillSource, { SourceType: 'GitHub' }>, fetchFn: typeof fetch): Promise<GitHubTreeEntry[]> {
    const url = `https://api.github.com/repos/${source.Owner}/${source.Repo}/git/trees/${encodeURIComponent(source.Ref)}?recursive=1`;
    const tree = JSON.parse(await fetchText(url, fetchFn)) as GitHubTreeResponse;
    if (tree.truncated) {
        // ponytail: one recursive listing; a repo past GitHub's listing limit needs a per-folder walk.
        throw new Error(`GitHub truncated the file listing for ${source.Owner}/${source.Repo}; the repository is too large to list in one call`);
    }
    return tree.tree;
}
