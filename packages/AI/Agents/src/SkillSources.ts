/**
 * @fileoverview Where an external skill comes from, and how to fetch it: parse a URL or GitHub
 * location into a {@link SkillSource}, download its SKILL.md (plus, for GitHub, every other text
 * file in the skill folder), and hash the result so a later check can tell whether upstream moved.
 * No database access; {@link SkillImportExportService} does the persistence.
 *
 * Every request goes through `SafeFetch` with `RequireHttps`: https only, and no hop (the first or a
 * redirect) may reach a private, loopback or link-local address. Each request has a timeout and a byte
 * cap. {@link FetchSkillBundle} re-validates the source itself, so a URL stored on a skill row is held
 * to the same rules as one an admin just typed.
 *
 * @module @memberjunction/ai-agents
 */
import { createHash } from 'node:crypto';
import { SafeFetch } from '@memberjunction/network-utils';
import type { MJAISkillEntity } from '@memberjunction/core-entities';

/** A skill's upstream: a SKILL.md at a URL, or a skill folder in a GitHub repository at a ref. */
export type SkillSource =
    | { SourceType: 'URL'; URL: string }
    | { SourceType: 'GitHub'; Owner: string; Repo: string; Path: string; Ref: string };

/** A GitHub skill source. */
export type GitHubSkillSourceSpec = Extract<SkillSource, { SourceType: 'GitHub' }>;

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
/** SKILL.md and each other file may be at most this large; a larger sibling file is skipped (see {@link SkillBundle.Skipped}). */
export const MAX_SKILL_FILE_BYTES = 512 * 1024;
/** `AISkillFile.Path` is NVARCHAR(500). */
export const MAX_SKILL_FILE_PATH_LENGTH = 500;
/** Every request is abandoned after this long. */
export const SKILL_FETCH_TIMEOUT_MS = 30_000;
/** The GitHub tree listing describes the whole repository, so it gets a larger cap than a file. */
const MAX_TREE_LISTING_BYTES = 10 * 1024 * 1024;

const GITHUB_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com']);
/** An owner or repository name; `.` and `..` would walk the API path. */
const GITHUB_NAME_RE = /^(?!\.\.?$)[A-Za-z0-9_.-]+$/;
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

/**
 * Parses a source location. `https://github.com/<owner>/<repo>` (optionally `/tree/<ref>/<path>` for a
 * folder or `/blob/<ref>/<path>/SKILL.md` for the file) is a GitHub source; any other https URL is a
 * plain URL source whose body is the SKILL.md. A given `ref` always wins over the ref in the URL (so a
 * stored SourceURL, which names the imported commit, re-imports at the tracked ref); without one, the URL's
 * ref is used, or `HEAD` (the default branch) for a bare repository URL. When `ref` differs from the URL's,
 * the URL's ref must be one path segment (a commit SHA or a tag without slashes) for the path to split right.
 */
export function ParseSkillSource(location: string, ref?: string): SkillSource {
    const url = parseHttpsURL(location);
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
        return { SourceType: 'URL', URL: url.toString() };
    }
    return parseGitHubPath(url.pathname.split('/').filter(s => s.length > 0).map(decodeURIComponent), ref);
}

/** An absolute https URL, or a clear error. */
function parseHttpsURL(location: string): URL {
    let url: URL;
    try {
        url = new URL(location.trim());
    } catch {
        throw new Error(`Not a valid skill source URL: "${location}"`);
    }
    if (url.protocol !== 'https:') {
        throw new Error(`Skill sources must be https URLs: "${location}"`);
    }
    return url;
}

function parseGitHubPath(segments: string[], ref?: string): SkillSource {
    const [owner = '', rawRepo = '', kind, ...rest] = segments;
    const repo = rawRepo.replace(/\.git$/, '');
    if (!kind) {
        return GitHubSkillSource(owner, repo, '', ref ?? 'HEAD');
    }
    if ((kind !== 'tree' && kind !== 'blob') || rest.length === 0) {
        throw new Error('A GitHub skill source must be a repository, a folder (/tree/<ref>/...) or a SKILL.md (/blob/<ref>/...)');
    }
    const split = splitRefAndPath(rest, ref);
    const path = kind === 'blob' ? split.path.split('/').slice(0, -1).join('/') : split.path;
    // An explicit ref wins over the one in the URL. A stored SourceURL names the imported commit, so
    // re-importing it with the tracked ref (SourceRef) must follow that ref, not re-fetch the old commit.
    return GitHubSkillSource(owner, repo, path, ref ?? split.ref);
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
export function GitHubSkillSource(owner: string, repo: string, path: string, ref: string): GitHubSkillSourceSpec {
    if (!GITHUB_NAME_RE.test(owner) || !GITHUB_NAME_RE.test(repo)) {
        throw new Error('A GitHub skill source needs https://github.com/<owner>/<repo>');
    }
    // Split rather than trim with /^\/+|\/+$/: that regex backtracks quadratically on a long run of
    // slashes, and the path comes from a URL someone pasted. Empty segments (leading, trailing or
    // doubled slashes) drop out the same way.
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.some(s => s === '..' || s === '.')) {
        throw new Error(`Invalid skill folder path: "${path}"`);
    }
    if (!ref.trim()) {
        throw new Error('A GitHub skill source needs a ref (tag, branch or commit SHA)');
    }
    return { SourceType: 'GitHub', Owner: owner, Repo: repo, Path: segments.join('/'), Ref: ref.trim() };
}

/** Re-checks a structured source with the rules {@link ParseSkillSource} applies to a typed one; returns it normalized. */
export function ValidateSkillSource(source: SkillSource): SkillSource {
    if (source.SourceType === 'URL') {
        return { SourceType: 'URL', URL: parseHttpsURL(source.URL).toString() };
    }
    return GitHubSkillSource(source.Owner, source.Repo, source.Path, source.Ref);
}

/**
 * The URL stored in `AISkill.SourceURL`; for GitHub, a browsable folder link. Each segment of the ref
 * and path is percent-encoded, so a `#`, `?` or `%` in either survives the round trip through
 * {@link ParseSkillSource}.
 */
export function SkillSourceURL(source: SkillSource): string {
    if (source.SourceType === 'URL') return source.URL;
    const encode = (value: string) => value.split('/').map(encodeURIComponent).join('/');
    const tail = source.Path ? `/${encode(source.Path)}` : '';
    return `https://github.com/${source.Owner}/${source.Repo}/tree/${encode(source.Ref)}${tail}`;
}

/**
 * The source recorded on a skill row, re-validated with the same rules as an import, or null when the
 * skill has none. For GitHub, `SourceRef` is the ref the update check follows; `SourceURL` links the
 * commit that was imported, which can differ (an import records the commit, see
 * {@link ResolveGitHubCommit}). With no `SourceRef`, the ref in the URL is used.
 */
export function SkillSourceFromSkill(skill: Pick<MJAISkillEntity, 'SourceType' | 'SourceURL' | 'SourceRef'>): SkillSource | null {
    if (!skill.SourceType || !skill.SourceURL) return null;
    if (skill.SourceType === 'URL') return ValidateSkillSource({ SourceType: 'URL', URL: skill.SourceURL });
    const ref = skill.SourceRef?.trim() || undefined;
    const source = ParseSkillSource(skill.SourceURL, ref);
    if (source.SourceType !== 'GitHub') {
        throw new Error(`Skill source "${skill.SourceURL}" is recorded as GitHub but is not a github.com URL`);
    }
    return source;
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
 *
 * Every run decides afresh, so setting a flagged skill back to Active does not keep its current
 * version: while the source follows a moving ref whose content still differs, the next run flags it
 * again, and that is intended. To keep the current version, pin `SourceRef` to the commit in
 * `SourceURL` (or a tag at it), or clear `SourceType` to stop tracking.
 */
export function DecideSkillUpdateStatus(
    skill: Pick<MJAISkillEntity, 'Status' | 'SourceContentHash'>,
    upstreamHash: string
): MJAISkillEntity['Status'] | null {
    if (skill.Status !== 'Active') return null;
    return skill.SourceContentHash?.toLowerCase() === upstreamHash.toLowerCase() ? null : 'Pending';
}

/**
 * Throws, naming the offenders, when the files cannot all be stored as `MJ: AI Skill Files` rows: a path
 * longer than the column, or two paths that differ only by case (the unique key on (SkillID, Path) is
 * case-insensitive on SQL Server). Call it before writing anything.
 */
export function AssertStorableSkillFiles(files: readonly SkillBundleFile[]): void {
    const tooLong = files.filter(f => f.Path.length > MAX_SKILL_FILE_PATH_LENGTH).map(f => f.Path);
    if (tooLong.length > 0) {
        throw new Error(`Skill file paths longer than ${MAX_SKILL_FILE_PATH_LENGTH} characters: ${tooLong.join(', ')}`);
    }
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const file of files) {
        const other = seen.get(file.Path.toLowerCase());
        if (other !== undefined) clashes.push(`'${other}' and '${file.Path}'`);
        seen.set(file.Path.toLowerCase(), file.Path);
    }
    if (clashes.length > 0) {
        throw new Error(`Skill file paths that differ only by case cannot both be stored: ${clashes.join('; ')}`);
    }
}

/** Downloads a source, after re-validating it. */
export async function FetchSkillBundle(source: SkillSource): Promise<SkillBundle> {
    const valid = ValidateSkillSource(source);
    if (valid.SourceType === 'URL') {
        return { Markdown: await fetchText(valid.URL, MAX_SKILL_FILE_BYTES), Files: [], Skipped: [] };
    }
    return fetchGitHubBundle(valid);
}

/**
 * The commit (lowercase hex) a GitHub source's ref points at now. A ref that already is a full SHA is
 * returned without a request. Otherwise this costs one small API call, made on import only (the update
 * check does not need it). The tree listing's `sha` would be free, and in practice GitHub fills it with
 * the commit a ref resolved to, but it is documented as the tree's SHA; the commits API is documented to
 * return the commit, so a change on GitHub's side cannot turn this into a SHA nothing can be pinned to.
 */
export async function ResolveGitHubCommit(source: GitHubSkillSourceSpec): Promise<string> {
    if (COMMIT_SHA_RE.test(source.Ref)) return source.Ref.toLowerCase();
    const url = `https://api.github.com/repos/${source.Owner}/${source.Repo}/commits/${encodeURIComponent(source.Ref)}`;
    const sha = (await fetchText(url, 1024, 'application/vnd.github.sha')).trim();
    if (!COMMIT_SHA_RE.test(sha)) {
        throw new Error(`GitHub did not return a commit SHA for ${source.Owner}/${source.Repo}@${source.Ref}`);
    }
    return sha.toLowerCase();
}

/** GET through the SSRF guard: https on every hop, a timeout, and at most `maxBytes` of body. */
async function fetchText(url: string, maxBytes: number, accept?: string): Promise<string> {
    const response = await SafeFetch(url, {
        RequireHttps: true,
        signal: AbortSignal.timeout(SKILL_FETCH_TIMEOUT_MS),
        headers: accept ? { Accept: accept } : undefined,
    });
    if (!response.ok) {
        void response.body?.cancel();
        throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
    }
    return readTextWithCap(response, maxBytes, url);
}

/** Reads a body as UTF-8, abandoning it (and cancelling the stream) the moment it passes `maxBytes`. */
async function readTextWithCap(response: Response, maxBytes: number, url: string): Promise<string> {
    const declared = Number(response.headers.get('content-length') ?? '');
    if (declared > maxBytes) {
        void response.body?.cancel();
        throw new Error(`${url} is ${declared} bytes; the limit is ${maxBytes}`);
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            total += chunk.value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new Error(`${url} is larger than the ${maxBytes}-byte limit`);
            }
            chunks.push(chunk.value);
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
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
async function fetchGitHubBundle(source: GitHubSkillSourceSpec): Promise<SkillBundle> {
    const folder = source.Path ? `${source.Path}/` : '';
    const blobs = (await listGitHubTree(source)).filter(e => e.type === 'blob' && e.path.startsWith(folder));
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
    const [markdown, ...contents] = await Promise.all([skillMd, ...fits].map(e => fetchText(rawURL(e.path), MAX_SKILL_FILE_BYTES)));
    const files = fits.map((e, i) => ({ Path: e.path.slice(folder.length), Content: contents[i] }));
    const text = files.filter(f => !f.Content.includes('\u0000')); // a NUL byte means binary
    const skipped = others.map(e => e.path.slice(folder.length)).filter(p => !text.some(f => f.Path === p));
    return { Markdown: markdown, Files: text, Skipped: skipped };
}

async function listGitHubTree(source: GitHubSkillSourceSpec): Promise<GitHubTreeEntry[]> {
    const url = `https://api.github.com/repos/${source.Owner}/${source.Repo}/git/trees/${encodeURIComponent(source.Ref)}?recursive=1`;
    const tree = JSON.parse(await fetchText(url, MAX_TREE_LISTING_BYTES)) as GitHubTreeResponse;
    if (tree.truncated) {
        // ponytail: one recursive listing; a repo past GitHub's listing limit needs a per-folder walk.
        throw new Error(`GitHub truncated the file listing for ${source.Owner}/${source.Repo}; the repository is too large to list in one call`);
    }
    return tree.tree;
}
