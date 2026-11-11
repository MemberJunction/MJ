import { globSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, matchesGlob, relative, resolve } from 'node:path';
import type { ChatTool } from '@memberjunction/ai';
import { IsInside, ReadAllowed } from './AgentGuards';

/** The text a read tool returns to the model, and whether it is a refusal or a failure. */
export interface ReadToolResult { Text: string; IsError: boolean; }

const DENIED: ReadToolResult = { Text: 'denied: reads stay inside the base worktree', IsError: true };
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_LINE_LIMIT = 2000;
const MAX_GREP_LINES = 200;
const MAX_GLOB_PATHS = 500;
const MAX_GREP_FILES = 2000;
/** Folders the search tools never enter. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', '.jit-catch']);

function error(text: string): ReadToolResult { return { Text: text, IsError: true }; }

/** Lines `offset` (1-based, default 1) to `offset + limit - 1` (default 2000 lines) of a UTF-8 file inside `root`, each prefixed `N\t`. */
export function ReadFile(root: string, input: { path: string; offset?: number; limit?: number }): ReadToolResult {
    const abs = resolve(root, input.path);
    if (!ReadAllowed('Read', { file_path: abs }, root)) return DENIED;
    const stat = statSync(abs, { throwIfNoEntry: false });
    if (!stat?.isFile()) return error(`not a file: ${input.path}`);
    if (stat.size > MAX_FILE_BYTES) return error(`file is over 2 MB: ${input.path}`);
    const lines = readFileSync(abs, 'utf8').split('\n');
    const start = Math.max(1, input.offset ?? 1); const limit = Math.max(1, input.limit ?? DEFAULT_LINE_LIMIT);
    return { Text: lines.slice(start - 1, start - 1 + limit).map((line, i) => `${start + i}\t${line}`).join('\n'), IsError: false };
}

/**
 * Lines matching the JS regular expression `pattern` under `path` (default `root`), as `relative/path:line: text`; `glob` filters file names.
 * Stops at 200 lines or after 2000 files read, and says so on a last line.
 */
export function Grep(root: string, input: { pattern: string; path?: string; glob?: string }): ReadToolResult {
    const abs = input.path === undefined ? undefined : resolve(root, input.path);
    if (!ReadAllowed('Grep', { path: abs, glob: input.glob }, root)) return DENIED;
    let regex: RegExp;
    try { regex = new RegExp(input.pattern); } catch (e) { return error(`invalid regular expression: ${(e as Error).message}`); }
    const real = realpathSync.native(root);
    const out: string[] = []; let filesRead = 0;
    for (const file of walkFiles(input.path === undefined ? real : resolve(real, input.path))) {
        const rel = relative(real, file);
        if (input.glob !== undefined && !matchesGlob(rel, input.glob) && !matchesGlob(basename(file), input.glob)) continue;
        if (statSync(file).size > MAX_FILE_BYTES) continue;
        if (filesRead === MAX_GREP_FILES) return { Text: `${out.length > 0 ? out.join('\n') : 'no matches'}\n… [search stopped after ${MAX_GREP_FILES} files]`, IsError: false };
        filesRead++;
        const lines = readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (!regex.test(lines[i])) continue;
            if (out.length === MAX_GREP_LINES) return { Text: `${out.join('\n')}\n… [more matches]`, IsError: false };
            out.push(`${rel}:${i + 1}: ${lines[i]}`);
        }
    }
    return { Text: out.length > 0 ? out.join('\n') : 'no matches', IsError: false };
}

/** Regular files under `start` (or `start` itself when it is one), in name order; skips `SKIPPED_DIRS` and every symlink. */
function* walkFiles(start: string): Generator<string> {
    const stat = lstatSync(start, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink()) return;
    if (stat.isFile()) { yield start; return; }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(start, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) yield* walkFiles(join(start, entry.name));
        else if (entry.isFile()) yield join(start, entry.name);
    }
}

/** Paths matching `pattern` under `path` (default `root`), relative to `root`, sorted, at most 500; names behind a symlink out of `root` are left out. */
export function Glob(root: string, input: { pattern: string; path?: string }): ReadToolResult {
    const abs = input.path === undefined ? undefined : resolve(root, input.path);
    if (!ReadAllowed('Glob', { path: abs, pattern: input.pattern }, root)) return DENIED;
    const real = realpathSync.native(root); const cwd = input.path === undefined ? real : resolve(real, input.path);
    const paths = globSync(input.pattern, { cwd, exclude: (p) => SKIPPED_DIRS.has(basename(p)) })
        .map((p) => join(cwd, p)).filter((p) => IsInside(real, p)).map((p) => relative(real, p)).sort();
    if (paths.length === 0) return { Text: 'no matches', IsError: false };
    const shown = paths.slice(0, MAX_GLOB_PATHS).join('\n');
    return { Text: paths.length > MAX_GLOB_PATHS ? `${shown}\n… [more paths]` : shown, IsError: false };
}

/** Declarations of read_file, grep and glob, with schemas in the cross-provider subset. */
export const READ_TOOLS: ChatTool[] = [
    { name: 'read_file', description: 'Read a text file of the base worktree. Returns its lines prefixed with their line numbers.',
        inputSchema: { type: 'object', properties: {
            path: { type: 'string', description: 'File path, relative to the worktree root.' },
            offset: { type: 'integer', description: 'First line to return, 1-based. Default 1.' },
            limit: { type: 'integer', description: 'Number of lines to return. Default 2000.' },
        }, required: ['path'] } },
    { name: 'grep', description: 'Search file contents of the base worktree with a JavaScript regular expression. Returns path:line: text for each matching line.',
        inputSchema: { type: 'object', properties: {
            pattern: { type: 'string', description: 'JavaScript regular expression.' },
            path: { type: 'string', description: 'Folder or file to search, relative to the worktree root. Default: the whole worktree.' },
            glob: { type: 'string', description: 'Only search files whose name or relative path matches this glob, for example *.ts.' },
        }, required: ['pattern'] } },
    { name: 'glob', description: 'List the files of the base worktree that match a glob pattern, for example packages/MJCore/src/**/*.ts.',
        inputSchema: { type: 'object', properties: {
            pattern: { type: 'string', description: 'Glob pattern, relative to path.' },
            path: { type: 'string', description: 'Folder to search from, relative to the worktree root. Default: the worktree root.' },
        }, required: ['pattern'] } },
];
