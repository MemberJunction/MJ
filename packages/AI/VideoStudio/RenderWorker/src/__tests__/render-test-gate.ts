import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fssync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveHeadlessShellPath } from '@hyperframes/engine';

export interface CheckRealRenderTestsOptions {
    Env?: NodeJS.ProcessEnv;
    SpawnSync?: (command: string, args: ReadonlyArray<string>) => Pick<SpawnSyncReturns<Buffer>, 'status'>;
    ExistsSync?: (filePath: string) => boolean;
    ResolveBrowserPath?: (env: NodeJS.ProcessEnv, existsSync: (filePath: string) => boolean) => string | undefined;
    Log?: (message: string) => void;
}

function findFileRecursive(
    dir: string,
    targetName: string,
    existsSync: (filePath: string) => boolean,
): string | undefined {
    if (!existsSync(dir)) {
        return undefined;
    }
    try {
        const entries = fssync.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === targetName) {
                return fullPath;
            }
            if (entry.isDirectory()) {
                const nested = findFileRecursive(fullPath, targetName, existsSync);
                if (nested) {
                    return nested;
                }
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export function DefaultResolveBrowserPath(
    env: NodeJS.ProcessEnv = process.env,
    existsSync: (filePath: string) => boolean = fssync.existsSync,
): string | undefined {
    const envCandidates = [env.CHROME_PATH, env.PUPPETEER_EXECUTABLE_PATH, env.HYPERFRAMES_BROWSER_PATH];
    for (const candidate of envCandidates) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }

    const fromEngine = resolveHeadlessShellPath();
    if (fromEngine && existsSync(fromEngine)) {
        return fromEngine;
    }

    if (env.PUPPETEER_CACHE_DIR) {
        const fromCustomCache = findFileRecursive(env.PUPPETEER_CACHE_DIR, 'chrome-headless-shell', existsSync);
        if (fromCustomCache) {
            return fromCustomCache;
        }
    }

    const homeDir = os.homedir();
    const cacheDirs = [
        path.join(homeDir, '.cache', 'hyperframes'),
        path.join(homeDir, '.cache', 'puppeteer', 'chrome-headless-shell'),
    ];
    for (const cacheDir of cacheDirs) {
        const found = findFileRecursive(cacheDir, 'chrome-headless-shell', existsSync);
        if (found) {
            return found;
        }
    }

    const systemCandidates = [
        '/opt/puppeteer-cache/chrome-headless-shell-bin',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable',
    ];
    for (const candidate of systemCandidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

/**
 * Shared opt-in gate for real-render test suites (`VIDEO_STUDIO_RENDER_TESTS=1`).
 *
 * When `VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1` is set (e.g. in CI), any missing prerequisite
 * (`VIDEO_STUDIO_RENDER_TESTS !== '1'`, missing `ffmpeg`, or missing Chrome/Chromium binary)
 * throws an error instead of returning `false`, so a required CI job can never pass by
 * silently skipping every real-render test.
 */
export function CheckCanRunRealRenderTests(
    suiteLabel: string,
    options?: CheckRealRenderTestsOptions,
): boolean {
    const env = options?.Env ?? process.env;
    const runSpawn =
        options?.SpawnSync ??
        ((cmd: string, args: ReadonlyArray<string>) => spawnSync(cmd, args, { stdio: 'ignore' }));
    const existsSync = options?.ExistsSync ?? fssync.existsSync;
    const resolveBrowser = options?.ResolveBrowserPath ?? DefaultResolveBrowserPath;
    const log = options?.Log ?? console.info;
    const isRequired = env.VIDEO_STUDIO_RENDER_TESTS_REQUIRED === '1';

    const failOrSkip = (reason: string): boolean => {
        const message = `[${suiteLabel}] ${reason}`;
        if (isRequired) {
            throw new Error(
                `${message} (VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1 forbids skipping real-render suites.)`,
            );
        }
        log(`Skipping real-render suite: ${message}`);
        return false;
    };

    if (env.VIDEO_STUDIO_RENDER_TESTS !== '1') {
        return failOrSkip('set VIDEO_STUDIO_RENDER_TESTS=1 to enable.');
    }

    const ffmpegRes = runSpawn('ffmpeg', ['-version']);
    if (ffmpegRes.status !== 0) {
        return failOrSkip('ffmpeg binary not found on PATH.');
    }

    if (env.CHROME_PATH && !existsSync(env.CHROME_PATH)) {
        return failOrSkip(`Chrome binary not found at CHROME_PATH (${env.CHROME_PATH}).`);
    }

    if (isRequired) {
        const browserBin = resolveBrowser(env, existsSync);
        if (!browserBin) {
            return failOrSkip(
                'Chromium headless shell binary not found (run `pnpm --filter @memberjunction/video-studio-render-worker run browser:install` or set CHROME_PATH).',
            );
        }
    }

    return true;
}
