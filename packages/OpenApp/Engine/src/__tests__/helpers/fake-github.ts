/**
 * A fake GitHub (the REST API AND raw.githubusercontent.com) answered from a `fetch` stub.
 *
 * Octokit sends every request through `globalThis.fetch`, and so does the client's raw-content path,
 * so stubbing fetch puts the REAL Octokit (its URL encoding, pagination and error types) and the real
 * github-client under test against one in-memory set of repositories. Every request is recorded, which
 * is what lets a test count REST calls exactly instead of inferring them from mocked method calls.
 *
 * The behaviors mirrored here were checked against the live API: the Trees API accepts a
 * percent-encoded `<ref>:<path>` tree-ish and returns paths relative to that directory, answers 404
 * for a missing ref or directory, 422 when the path is a file, and 400 for a path with a trailing
 * slash; the Contents API stops inlining content above 1 MB.
 */
import { createHash } from 'node:crypto';

/** GitHub's Contents API only inlines file content below this size. */
const INLINE_CONTENT_LIMIT = 1024 * 1024;

export interface FakeFile {
    Content: string;
    /** Size GitHub reports for the blob. Defaults to the content's byte length. */
    Size?: number;
    /** Git file mode. '120000' makes the entry a symbolic link, which the Contents API types as 'symlink'. */
    Mode?: string;
}

export interface FakeRelease {
    TagName: string;
    PreRelease: boolean;
    Draft: boolean;
    CreatedAt: string;
}

export interface FakeRepo {
    Owner: string;
    Repo: string;
    /** Files per ref: 'HEAD' is the default branch; every other key is a tag name. */
    Files: Record<string, Record<string, FakeFile>>;
    /** Tags listed by the API but never read (older or out-of-range versions). */
    ExtraTags?: string[];
    Releases?: FakeRelease[];
    /** When set, both hosts answer 404 unless `Authorization` carries this token, as GitHub does for a private repo. */
    RequiredToken?: string;
    /** Report every tree of this repo as truncated, which forces the client's per-directory fallback. */
    TruncateTrees?: boolean;
}

/** How raw.githubusercontent.com behaves: serve files, fail at the network layer, or answer one fixed status. */
export type FakeRawMode = 'serve' | 'unreachable' | number;

export interface FakeGitHubOptions {
    /** REST requests allowed before the primary rate limit answers 403. Unlimited when omitted. */
    ApiBudget?: number;
    /** Epoch SECONDS reported in `x-ratelimit-reset` once the budget is spent. */
    RateLimitResetEpoch?: number;
    Raw?: FakeRawMode;
    /** Bytes raw.githubusercontent.com serves INSTEAD of the real file, keyed by repository path —
     * a stale CDN copy after a tag moved, or a proxy's block page served with a 200. */
    RawOverrides?: Record<string, string>;
}

export interface FakeRequest {
    Host: 'api' | 'raw';
    /** The full request URL, exactly as sent. */
    Url: string;
    /** A short route label for breakdowns, e.g. 'trees', 'contents', 'raw'. */
    Route: string;
    Authorization?: string;
}

type RouteHandler = (repo: FakeRepo, rest: string[], url: URL) => Response;

interface TreeNode {
    Children: Map<string, TreeNode>;
    File?: FakeFile;
}

export class FakeGitHub {
    public readonly Requests: FakeRequest[] = [];
    private readonly repos = new Map<string, FakeRepo>();
    private readonly blobs = new Map<string, FakeFile>();
    private readonly options: FakeGitHubOptions;
    private apiRequestCount = 0;

    constructor(repos: FakeRepo[], options: FakeGitHubOptions = {}) {
        this.options = options;
        for (const repo of repos) {
            this.repos.set(`${repo.Owner}/${repo.Repo}`.toLowerCase(), repo);
        }
    }

    /** REST API requests made so far (rate-limited ones included: GitHub counts them too). */
    public get ApiCalls(): number {
        return this.Requests.filter(r => r.Host === 'api').length;
    }

    public get RawCalls(): number {
        return this.Requests.filter(r => r.Host === 'raw').length;
    }

    /** REST calls grouped by route — the readable form for an assertion message. */
    public ApiBreakdown(): Record<string, number> {
        const out: Record<string, number> = {};
        for (const r of this.Requests.filter(x => x.Host === 'api')) {
            out[r.Route] = (out[r.Route] ?? 0) + 1;
        }
        return out;
    }

    /** The `fetch` implementation to install with `vi.stubGlobal('fetch', fake.Fetch)`. */
    public readonly Fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const authorization = new Headers(init?.headers).get('authorization') ?? undefined;
        if (url.host === 'raw.githubusercontent.com') {
            return this.handleRaw(url, authorization);
        }
        if (url.host === 'api.github.com') {
            return this.handleApi(url, authorization);
        }
        throw new Error(`FakeGitHub: unexpected host in ${url.href}`);
    };

    // ── raw.githubusercontent.com ───────────────────────────────────────────

    private handleRaw(url: URL, authorization: string | undefined): Response {
        this.Requests.push({ Host: 'raw', Url: url.href, Route: 'raw', Authorization: authorization });
        const mode = this.options.Raw ?? 'serve';
        if (mode === 'unreachable') {
            throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND raw.githubusercontent.com') });
        }
        if (typeof mode === 'number') {
            return new Response(`status ${mode}`, { status: mode, headers: mode === 429 ? { 'retry-after': '60' } : {} });
        }
        const segments = url.pathname.split('/').slice(1).map(decodeURIComponent);
        const repo = this.repos.get(`${segments[0]}/${segments[1]}`.toLowerCase());
        if (!repo || !this.authorized(repo, authorization)) {
            return new Response('404: Not Found', { status: 404 });
        }
        const { Ref, Path } = this.parseRawRef(segments.slice(2));
        const file = repo.Files[Ref]?.[Path];
        const body = this.options.RawOverrides?.[Path] ?? file?.Content;
        return file && body !== undefined
            ? new Response(Buffer.from(body, 'utf-8'), { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
            : new Response('404: Not Found', { status: 404 });
    }

    /** Raw URLs name the ref as `HEAD`, `refs/tags/<tag>`, or a bare tag; the rest is the file path. */
    private parseRawRef(segments: string[]): { Ref: string; Path: string } {
        if (segments[0] === 'refs' && segments[1] === 'tags') {
            return { Ref: segments[2], Path: segments.slice(3).join('/') };
        }
        return { Ref: segments[0], Path: segments.slice(1).join('/') };
    }

    // ── api.github.com ───────────────────────────────────────────────────────

    private handleApi(url: URL, authorization: string | undefined): Response {
        const segments = url.pathname.split('/').slice(1);
        const route = this.routeLabel(segments);
        this.Requests.push({ Host: 'api', Url: url.href, Route: route, Authorization: authorization });
        this.apiRequestCount++;
        if (this.options.ApiBudget !== undefined && this.apiRequestCount > this.options.ApiBudget) {
            return this.rateLimited();
        }
        const repo = this.repos.get(`${decodeURIComponent(segments[1])}/${decodeURIComponent(segments[2])}`.toLowerCase());
        if (segments[0] !== 'repos' || !repo || !this.authorized(repo, authorization)) {
            return this.json(404, { message: 'Not Found' });
        }
        const handler = this.handlers[route];
        return handler ? handler(repo, segments.slice(3), url) : this.json(404, { message: `FakeGitHub: no route ${url.pathname}` });
    }

    private routeLabel(segments: string[]): string {
        const kind = segments[3];
        return kind === 'git' ? segments[4] : kind;
    }

    private readonly handlers: Record<string, RouteHandler> = {
        contents: (repo, rest, url) => this.contents(repo, rest.slice(1).map(decodeURIComponent).join('/'), url.searchParams.get('ref') ?? 'HEAD'),
        blobs: (_repo, rest) => this.blob(decodeURIComponent(rest[2])),
        ref: (repo, rest) => this.ref(repo, rest.slice(2).map(decodeURIComponent).join('/')),
        trees: (repo, rest, url) => this.tree(repo, decodeURIComponent(rest[2]), url.searchParams.has('recursive')),
        tags: (repo, _rest, url) => this.page(this.tagNames(repo).map(name => ({ name })), url),
        releases: (repo, _rest, url) => this.page((repo.Releases ?? []).map(r => ({
            tag_name: r.TagName, prerelease: r.PreRelease, draft: r.Draft, created_at: r.CreatedAt,
        })), url),
    };

    private contents(repo: FakeRepo, path: string, ref: string): Response {
        const files = repo.Files[ref];
        if (!files) {
            return this.json(404, { message: `No commit found for the ref ${ref}` });
        }
        const file = files[path];
        if (file) {
            const size = this.sizeOf(file);
            const inline = size < INLINE_CONTENT_LIMIT;
            return this.json(200, {
                type: 'file', name: path.split('/').pop(), path, sha: this.blobSha(repo, ref, path), size,
                encoding: inline ? 'base64' : 'none',
                content: inline ? Buffer.from(file.Content, 'utf-8').toString('base64') : '',
            });
        }
        const node = this.findNode(this.buildTree(files), path);
        if (!node || node.File) {
            return this.json(404, { message: 'Not Found' });
        }
        return this.json(200, [...node.Children.entries()].map(([name, child]) => ({
            name, path: `${path}/${name}`, type: this.contentsType(child),
            sha: child.File ? this.blobSha(repo, ref, `${path}/${name}`) : `tree-${ref}-${path}/${name}`,
        })));
    }

    private blob(sha: string): Response {
        const file = this.blobs.get(sha);
        return file
            ? this.json(200, { sha, encoding: 'base64', content: Buffer.from(file.Content, 'utf-8').toString('base64'), size: this.sizeOf(file) })
            : this.json(404, { message: 'Not Found' });
    }

    private ref(repo: FakeRepo, ref: string): Response {
        const tag = ref.startsWith('tags/') ? ref.slice('tags/'.length) : undefined;
        return tag && this.tagNames(repo).includes(tag)
            ? this.json(200, { ref: `refs/${ref}`, object: { type: 'commit', sha: `commit-${tag}` } })
            : this.json(404, { message: 'Not Found' });
    }

    private tree(repo: FakeRepo, treeish: string, recursive: boolean): Response {
        const colon = treeish.indexOf(':');
        const ref = colon >= 0 ? treeish.slice(0, colon) : treeish;
        const path = colon >= 0 ? treeish.slice(colon + 1) : '';
        if (path.endsWith('/') || path.startsWith('/')) {
            return this.json(400, { message: 'Request path could not be canonicalized.' });
        }
        const files = repo.Files[ref];
        const node = files ? this.findNode(this.buildTree(files), path) : undefined;
        if (!files || !node) {
            return this.json(404, { message: 'Not Found' });
        }
        if (node.File) {
            return this.json(422, { message: 'Invalid object requested. SHA must identify a commit or a tree.' });
        }
        const entries: Array<Record<string, string | number>> = [];
        this.collectTreeEntries(repo, ref, path, node, '', recursive, entries);
        return this.json(200, { sha: `tree-${ref}-${path}`, truncated: repo.TruncateTrees === true, tree: entries });
    }

    /** Pre-order walk in git's tree order (a directory sorts as `<name>/`), like the real recursive listing. */
    private collectTreeEntries(
        repo: FakeRepo, ref: string, root: string, node: TreeNode, prefix: string, recursive: boolean,
        out: Array<Record<string, string | number>>,
    ): void {
        const names = [...node.Children.keys()].sort((a, b) => {
            const ka = node.Children.get(a)!.File ? a : `${a}/`;
            const kb = node.Children.get(b)!.File ? b : `${b}/`;
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
        for (const name of names) {
            const child = node.Children.get(name)!;
            const relative = prefix ? `${prefix}/${name}` : name;
            if (child.File) {
                const full = root ? `${root}/${relative}` : relative;
                out.push({ path: relative, mode: child.File.Mode ?? '100644', type: 'blob', sha: this.blobSha(repo, ref, full), size: this.sizeOf(child.File) });
            } else {
                out.push({ path: relative, mode: '040000', type: 'tree', sha: `tree-${ref}-${relative}` });
                if (recursive) {
                    this.collectTreeEntries(repo, ref, root, child, relative, recursive, out);
                }
            }
        }
    }

    // ── shared helpers ───────────────────────────────────────────────────────

    private contentsType(node: TreeNode): 'file' | 'dir' | 'symlink' {
        if (!node.File) {
            return 'dir';
        }
        return node.File.Mode === '120000' ? 'symlink' : 'file';
    }

    private tagNames(repo: FakeRepo): string[] {
        return [...Object.keys(repo.Files).filter(ref => ref !== 'HEAD'), ...(repo.ExtraTags ?? [])];
    }

    private page<T>(items: T[], url: URL): Response {
        const perPage = Number(url.searchParams.get('per_page') ?? '30');
        const page = Number(url.searchParams.get('page') ?? '1');
        const slice = items.slice((page - 1) * perPage, page * perPage);
        const headers: Record<string, string> = {};
        if (page * perPage < items.length) {
            const next = new URL(url.href);
            next.searchParams.set('page', String(page + 1));
            headers.link = `<${next.href}>; rel="next"`;
        }
        return this.json(200, slice, headers);
    }

    private buildTree(files: Record<string, FakeFile>): TreeNode {
        const root: TreeNode = { Children: new Map() };
        for (const [path, file] of Object.entries(files)) {
            let node = root;
            const parts = path.split('/');
            parts.forEach((part, index) => {
                if (!node.Children.has(part)) {
                    node.Children.set(part, { Children: new Map() });
                }
                node = node.Children.get(part)!;
                if (index === parts.length - 1) {
                    node.File = file;
                }
            });
        }
        return root;
    }

    private findNode(root: TreeNode, path: string): TreeNode | undefined {
        let node: TreeNode | undefined = root;
        for (const part of path.split('/').filter(Boolean)) {
            node = node?.Children.get(part);
        }
        return node;
    }

    /** The file's real git blob id — SHA-1 over `blob <length>\0<bytes>` — as GitHub reports it. */
    private blobSha(repo: FakeRepo, ref: string, path: string): string {
        const file = repo.Files[ref][path];
        const bytes = Buffer.from(file.Content, 'utf-8');
        const sha = createHash('sha1').update(`blob ${bytes.length}\u0000`).update(bytes).digest('hex');
        this.blobs.set(sha, file);
        return sha;
    }

    private sizeOf(file: FakeFile): number {
        return file.Size ?? Buffer.byteLength(file.Content, 'utf-8');
    }

    private authorized(repo: FakeRepo, authorization: string | undefined): boolean {
        return !repo.RequiredToken || (authorization ?? '').endsWith(` ${repo.RequiredToken}`);
    }

    private rateLimited(): Response {
        const reset = this.options.RateLimitResetEpoch ?? Math.floor(Date.now() / 1000) + 3600;
        return this.json(403, {
            message: "API rate limit exceeded for 203.0.113.7. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
            documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
        }, {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(reset),
            'x-ratelimit-used': '60',
            'x-ratelimit-resource': 'core',
        });
    }

    private json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
        });
    }
}
