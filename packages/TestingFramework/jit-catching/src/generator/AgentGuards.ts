import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

const MAX_LINK_HOPS = 40;

/**
 * `realpath` of the path, or of its nearest existing parent joined with the rest, so a new file under a symlinked
 * folder resolves to where it would land. A dangling symlink resolves to where its target would be.
 */
export function ResolveNearest(path: string): string { return resolveNearest(resolve(path), 0); }

function resolveNearest(abs: string, hops: number): string {
    const stat = lstatSync(abs, { throwIfNoEntry: false });
    if (stat) {
        try { return realpathSync.native(abs); }
        catch {
            if (!stat.isSymbolicLink() || hops >= MAX_LINK_HOPS) throw new Error(`cannot resolve ${abs}`);
            return resolveNearest(resolve(dirname(abs), readlinkSync(abs)), hops + 1);
        }
    }
    const parent = dirname(abs);
    return parent === abs ? abs : join(resolveNearest(parent, hops), basename(abs));
}

/** True when `target` lands inside `root`; both sides go through `ResolveNearest`. */
export function IsInside(root: string, target: string): boolean {
    const r = ResolveNearest(root); const t = ResolveNearest(target);
    return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep);
}

const READ_PATH_KEY: Record<string, string> = { Read: 'file_path', Grep: 'path', Glob: 'path' };

/** True when a glob pattern cannot name files outside the folder it searches. */
function safeGlob(pattern: unknown): boolean {
    return typeof pattern === 'string' && !isAbsolute(pattern) && !pattern.startsWith('~') && !pattern.split(/[\\/]/).includes('..');
}

/**
 * Permission check for the read tools: the path, a Glob pattern and a Grep `glob` filter must stay inside `root`.
 * Grep and Glob without a path search `cwd`, the base worktree.
 */
export function ReadAllowed(tool: string, input: Record<string, unknown>, root: string): boolean {
    const key = READ_PATH_KEY[tool]; if (!key) return false;
    if (tool === 'Glob' && !safeGlob(input.pattern)) return false;
    if (tool === 'Grep' && input.glob !== undefined && !safeGlob(input.glob)) return false;
    const path = input[key];
    if (path === undefined) return tool !== 'Read';
    return typeof path === 'string' && IsInside(root, resolve(root, path));
}

/** Environment for the SDK child: PATH, an empty HOME and the key, so no Claude Code login or config is in reach. */
export function AgentEnv(env: NodeJS.ProcessEnv, emptyHome: string): Record<string, string> {
    if (env.CLAUDECODE) throw new Error('the JiT agent must not run inside a Claude Code session: its login would replace ANTHROPIC_API_KEY');
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    return { PATH: env.PATH ?? '/usr/bin:/bin', HOME: emptyHome, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY };
}

/** The SDK's init message must name the environment key as the credential the session uses. */
export function AssertApiKeySource(source: string | undefined): void {
    if (source !== 'ANTHROPIC_API_KEY') throw new Error(`agent credential is ${source ?? 'unknown'}, expected ANTHROPIC_API_KEY`);
}
