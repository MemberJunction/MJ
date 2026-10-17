import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VIDEO_FORMATS,
    type RenderProjectBundle,
    type VideoFormat,
} from '@memberjunction/video-studio-core';
import { RenderWorkerError } from './backend.js';
import {
    BuildPreambleOptionsFromBundle,
    InjectPreambleIntoHtml,
    type PreambleRuntimeOptions,
} from './preamble.js';

const PACKAGE_FONTS_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'assets',
    'fonts',
);
const BUNDLED_FONT_FILES = ['Inter-Regular.ttf', 'JetBrainsMono-Regular.ttf'] as const;

/** Maximum number of `Files` + `Assets` entries allowed in a single bundle. */
export const MAX_BUNDLE_ENTRIES = 2000;

/** Minimum allowed output frame dimension in pixels. */
export const MIN_FRAME_DIMENSION = 16;

/** Maximum allowed output frame dimension in pixels. */
export const MAX_FRAME_DIMENSION = 4096;

/** Maximum allowed relative deviation (1%) from the format's target aspect ratio. */
export const MAX_ASPECT_RATIO_TOLERANCE = 0.01;

/** Minimum allowed frame rate in frames per second. */
export const MIN_FPS = 1;

/** Maximum allowed frame rate in frames per second. */
export const MAX_FPS = 60;

/** Maximum allowed composition duration in seconds. */
export const MAX_DURATION_SECONDS = 600;

/**
 * Unpacked composition bundle staged in an isolated temporary directory on disk.
 */
export interface StagedBundle {
    /** Absolute path to the temporary root directory for this bundle. */
    readonly RootDir: string;
    /** Absolute path to the entry HTML file inside `RootDir`. */
    readonly EntryPath: string;
    /** Idempotently removes `RootDir` and all unpacked files. */
    Cleanup(): Promise<void>;
}

/**
 * Options for `StageRenderBundle`.
 */
export interface StageBundleOptions {
    /** Optional parent directory for `mkdtemp` (defaults to `os.tmpdir()`). */
    TempRoot?: string;
    /** Optional frame geometry forwarded to the `window.MJVideo` preamble. */
    Geometry?: {
        Width?: number;
        Height?: number;
        Fps?: number;
        DurationSeconds?: number;
    };
    /**
     * Whether to inject the CSP `<meta>` and `window.MJVideo` preamble into `.html` files
     * during initial staging (defaults to `true`).
     */
    InjectPreamble?: boolean;
}

/**
 * Parameters validated by `ValidateRenderGeometry`.
 */
export interface RenderGeometryParams {
    Format: VideoFormat;
    Width: number;
    Height: number;
    Fps?: number;
    DurationSeconds?: number;
}

/**
 * Validates a `RenderProjectBundle`, throwing `RenderWorkerError('InvalidBundle', ...)` on any violation.
 */
export function ValidateRenderBundle(bundle: RenderProjectBundle): void {
    if (!bundle || typeof bundle !== 'object') {
        throw new RenderWorkerError('InvalidBundle', 'Bundle must be a non-null object.');
    }
    if (!Array.isArray(bundle.Files) || !Array.isArray(bundle.Assets)) {
        throw new RenderWorkerError('InvalidBundle', 'Bundle.Files and Bundle.Assets must be arrays.');
    }
    if (!VIDEO_FORMATS.includes(bundle.Format)) {
        throw new RenderWorkerError(
            'InvalidBundle',
            `Bundle.Format must be one of ${VIDEO_FORMATS.join(', ')}, got "${String(bundle.Format)}".`,
        );
    }
    if (typeof bundle.Seed !== 'number' || !Number.isInteger(bundle.Seed)) {
        throw new RenderWorkerError('InvalidBundle', 'Bundle.Seed must be an integer.');
    }
    if (
        bundle.DataSnapshot !== undefined &&
        (bundle.DataSnapshot === null ||
            typeof bundle.DataSnapshot !== 'object' ||
            Array.isArray(bundle.DataSnapshot))
    ) {
        throw new RenderWorkerError('InvalidBundle', 'Bundle.DataSnapshot must be a plain object.');
    }

    const totalEntries = bundle.Files.length + bundle.Assets.length;
    if (totalEntries > MAX_BUNDLE_ENTRIES) {
        throw new RenderWorkerError(
            'InvalidBundle',
            `Bundle entry count (${totalEntries}) exceeds maximum allowed (${MAX_BUNDLE_ENTRIES}).`,
        );
    }

    ValidateBundleRelativePath(bundle.EntryFile, 'EntryFile');
    if (!/\.html?$/i.test(bundle.EntryFile)) {
        throw new RenderWorkerError('InvalidBundle', `EntryFile "${bundle.EntryFile}" must be an .html or .htm file.`);
    }

    validateFilesAndAssets(bundle);
}

function validateFilesAndAssets(bundle: RenderProjectBundle): void {
    const seenLowerPaths = new Set<string>();
    let foundEntry = false;

    for (const file of bundle.Files) {
        if (!file || typeof file.Content !== 'string') {
            throw new RenderWorkerError('InvalidBundle', 'Each composition file must have string Content.');
        }
        ValidateBundleRelativePath(file.Path, `Files[${file.Path}]`);
        registerUniqueRelativePath(seenLowerPaths, file.Path);
        if (file.Path === bundle.EntryFile) {
            foundEntry = true;
        }
    }

    if (!foundEntry) {
        throw new RenderWorkerError(
            'InvalidBundle',
            `EntryFile "${bundle.EntryFile}" was not found in Bundle.Files.`,
        );
    }

    for (const asset of bundle.Assets) {
        if (!asset || typeof asset !== 'object') {
            throw new RenderWorkerError('InvalidBundle', 'Each staged asset must be an object.');
        }
        ValidateBundleRelativePath(asset.RelativePath, `Assets[${asset.Key ?? ''}]`);
        registerUniqueRelativePath(seenLowerPaths, asset.RelativePath);
        validateBase64String(asset.DataBase64, asset.RelativePath);
    }
}

/**
 * Validates a bundle-relative path according to Step 5 security rules.
 */
export function ValidateBundleRelativePath(relPath: string, label: string): void {
    if (typeof relPath !== 'string' || relPath.length === 0 || relPath.trim().length === 0) {
        throw new RenderWorkerError('InvalidBundle', `${label} must be a non-empty relative path.`);
    }
    if (/[\x00-\x1f\x7f]/.test(relPath)) {
        throw new RenderWorkerError('InvalidBundle', `${label} contains a control character.`);
    }
    if (relPath.includes('\\')) {
        throw new RenderWorkerError('InvalidBundle', `${label} must not contain backslashes.`);
    }
    if (relPath.startsWith('/') || path.posix.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) {
        throw new RenderWorkerError('InvalidBundle', `${label} must not be an absolute path.`);
    }
    if (/^[A-Za-z]:/.test(relPath)) {
        throw new RenderWorkerError('InvalidBundle', `${label} must not start with a drive letter.`);
    }
    const segments = relPath.split('/');
    for (const segment of segments) {
        if (segment === '' || segment === '.' || segment === '..') {
            throw new RenderWorkerError(
                'InvalidBundle',
                `${label} contains a forbidden path segment ("${segment}") in "${relPath}".`,
            );
        }
    }
}

/**
 * Validates render request geometry, frame rate, and duration, throwing `InvalidRequest` on error.
 */
export function ValidateRenderGeometry(params: RenderGeometryParams): void {
    const { Format, Width, Height, Fps, DurationSeconds } = params;
    if (
        typeof Width !== 'number' ||
        !Number.isInteger(Width) ||
        Width < MIN_FRAME_DIMENSION ||
        Width > MAX_FRAME_DIMENSION
    ) {
        throw new RenderWorkerError(
            'InvalidRequest',
            `Width must be an integer in ${MIN_FRAME_DIMENSION}..${MAX_FRAME_DIMENSION}, got ${String(Width)}.`,
        );
    }
    if (
        typeof Height !== 'number' ||
        !Number.isInteger(Height) ||
        Height < MIN_FRAME_DIMENSION ||
        Height > MAX_FRAME_DIMENSION
    ) {
        throw new RenderWorkerError(
            'InvalidRequest',
            `Height must be an integer in ${MIN_FRAME_DIMENSION}..${MAX_FRAME_DIMENSION}, got ${String(Height)}.`,
        );
    }

    const expectedRatio = expectedAspectRatio(Format);
    const actualRatio = Width / Height;
    const relativeError = Math.abs(actualRatio - expectedRatio) / expectedRatio;
    if (relativeError > MAX_ASPECT_RATIO_TOLERANCE) {
        throw new RenderWorkerError(
            'InvalidRequest',
            `Dimensions ${Width}x${Height} do not match format ${Format} aspect ratio within 1%.`,
        );
    }

    if (Fps !== undefined) {
        if (typeof Fps !== 'number' || !Number.isFinite(Fps) || Fps < MIN_FPS || Fps > MAX_FPS) {
            throw new RenderWorkerError(
                'InvalidRequest',
                `Fps must be in ${MIN_FPS}..${MAX_FPS}, got ${String(Fps)}.`,
            );
        }
    }

    if (DurationSeconds !== undefined) {
        if (
            typeof DurationSeconds !== 'number' ||
            !Number.isFinite(DurationSeconds) ||
            DurationSeconds <= 0 ||
            DurationSeconds > MAX_DURATION_SECONDS
        ) {
            throw new RenderWorkerError(
                'InvalidRequest',
                `DurationSeconds must be > 0 and <= ${MAX_DURATION_SECONDS}, got ${String(DurationSeconds)}.`,
            );
        }
    }
}

export interface CompositionGeometryMatchParams {
    Width: number;
    Height: number;
    DurationSeconds?: number;
}

/**
 * Validates that the entry HTML's `data-width`, `data-height`, and `data-duration` attributes
 * (if present on `[data-composition-id]`) match the request's `Width`, `Height`, and `DurationSeconds`,
 * throwing `RenderWorkerError('GEOMETRY_MISMATCH', ...)` (HTTP 400) on mismatch.
 */
export function ValidateCompositionGeometryMatch(
    bundle: RenderProjectBundle,
    params: CompositionGeometryMatchParams,
): void {
    if (!bundle || !Array.isArray(bundle.Files)) {
        return;
    }
    const entry = bundle.Files.find((f) => f && f.Path === bundle.EntryFile);
    if (!entry || typeof entry.Content !== 'string') {
        return;
    }

    const compositionTagMatch = /<[a-z0-9-]+\b[^>]*\bdata-composition-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/i.exec(
        entry.Content,
    );
    const scope = compositionTagMatch ? compositionTagMatch[0] : entry.Content;

    const widthMatch = /\bdata-width\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(scope);
    if (widthMatch) {
        const rawWidth = (widthMatch[1] ?? widthMatch[2] ?? widthMatch[3] ?? '').trim();
        const attrWidth = Number.parseFloat(rawWidth);
        if (!Number.isFinite(attrWidth) || attrWidth !== params.Width) {
            throw new RenderWorkerError(
                'GEOMETRY_MISMATCH',
                `Entry HTML data-width (${rawWidth}) does not match request Width (${params.Width}).`,
            );
        }
    }

    const heightMatch = /\bdata-height\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(scope);
    if (heightMatch) {
        const rawHeight = (heightMatch[1] ?? heightMatch[2] ?? heightMatch[3] ?? '').trim();
        const attrHeight = Number.parseFloat(rawHeight);
        if (!Number.isFinite(attrHeight) || attrHeight !== params.Height) {
            throw new RenderWorkerError(
                'GEOMETRY_MISMATCH',
                `Entry HTML data-height (${rawHeight}) does not match request Height (${params.Height}).`,
            );
        }
    }

    if (params.DurationSeconds !== undefined) {
        const durationMatch = /\bdata-duration\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(scope);
        if (durationMatch) {
            const rawDuration = (durationMatch[1] ?? durationMatch[2] ?? durationMatch[3] ?? '').trim();
            const attrDuration = Number.parseFloat(rawDuration);
            if (!Number.isFinite(attrDuration) || Math.abs(attrDuration - params.DurationSeconds) > 0.05) {
                throw new RenderWorkerError(
                    'GEOMETRY_MISMATCH',
                    `Entry HTML data-duration (${rawDuration}) does not match request DurationSeconds (${params.DurationSeconds}) within 0.05s tolerance.`,
                );
            }
        }
    }
}

/**
 * Reads the entry HTML's `data-fps` attribute on `[data-composition-id]` (or falls back to `defaultFps`),
 * range-checking it against `MIN_FPS..MAX_FPS` with `RenderWorkerError('InvalidRequest', ...)`.
 */
export function ResolveCompositionFps(bundle: RenderProjectBundle, defaultFps = 30): number {
    if (!bundle || !Array.isArray(bundle.Files)) {
        return defaultFps;
    }
    const entry = bundle.Files.find((f) => f && f.Path === bundle.EntryFile);
    if (!entry || typeof entry.Content !== 'string') {
        return defaultFps;
    }

    const compositionTagMatch = /<[a-z0-9-]+\b[^>]*\bdata-composition-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/i.exec(
        entry.Content,
    );
    const scope = compositionTagMatch ? compositionTagMatch[0] : entry.Content;
    const fpsMatch = /\bdata-fps\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(scope);
    if (!fpsMatch) {
        return defaultFps;
    }
    const rawFps = (fpsMatch[1] ?? fpsMatch[2] ?? fpsMatch[3] ?? '').trim();
    const parsedFps = Number(rawFps);
    if (rawFps.length === 0 || !Number.isFinite(parsedFps) || parsedFps < MIN_FPS || parsedFps > MAX_FPS) {
        throw new RenderWorkerError(
            'InvalidRequest',
            `Fps must be in ${MIN_FPS}..${MAX_FPS}, got ${rawFps || String(parsedFps)}.`,
        );
    }
    return parsedFps;
}

/**
 * Reads the entry HTML's `data-duration` attribute on `[data-composition-id]` (or falls back to
 * `defaultDurationSeconds`), range-checking it against `(0, MAX_DURATION_SECONDS]` with
 * `RenderWorkerError('InvalidRequest', ...)`.
 */
export function ResolveCompositionDuration(
    bundle: RenderProjectBundle,
    defaultDurationSeconds = 5,
): number {
    if (!bundle || !Array.isArray(bundle.Files)) {
        return defaultDurationSeconds;
    }
    const entry = bundle.Files.find((f) => f && f.Path === bundle.EntryFile);
    if (!entry || typeof entry.Content !== 'string') {
        return defaultDurationSeconds;
    }

    const compositionTagMatch = /<[a-z0-9-]+\b[^>]*\bdata-composition-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/i.exec(
        entry.Content,
    );
    const scope = compositionTagMatch ? compositionTagMatch[0] : entry.Content;
    const durationMatch = /\bdata-duration\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(scope);
    if (!durationMatch) {
        return defaultDurationSeconds;
    }
    const rawDuration = (durationMatch[1] ?? durationMatch[2] ?? durationMatch[3] ?? '').trim();
    const parsedDuration = Number(rawDuration);
    if (
        rawDuration.length === 0 ||
        !Number.isFinite(parsedDuration) ||
        parsedDuration <= 0 ||
        parsedDuration > MAX_DURATION_SECONDS
    ) {
        throw new RenderWorkerError(
            'InvalidRequest',
            `DurationSeconds must be > 0 and <= ${MAX_DURATION_SECONDS}, got ${rawDuration || String(parsedDuration)}.`,
        );
    }
    return parsedDuration;
}


/**
 * Stages a validated `RenderProjectBundle` into a fresh `mkdtemp` directory and injects the preamble
 * into every `.html` / `.htm` file (unless `options.InjectPreamble === false`).
 */
export async function StageRenderBundle(
    bundle: RenderProjectBundle,
    options?: StageBundleOptions,
): Promise<StagedBundle> {
    ValidateRenderBundle(bundle);
    const parentDir = options?.TempRoot ?? os.tmpdir();
    await fs.mkdir(parentDir, { recursive: true });
    const rootDir = await fs.mkdtemp(path.join(parentDir, 'mj-video-bundle-'));
    const injectPreamble = options?.InjectPreamble ?? true;
    const preambleOptions = BuildPreambleOptionsFromBundle(bundle, options?.Geometry);

    try {
        const entryPath = resolveInsideRoot(rootDir, bundle.EntryFile);
        for (const file of bundle.Files) {
            const targetPath = resolveInsideRoot(rootDir, file.Path);
            const isHtml = /\.html?$/i.test(file.Path);
            const content =
                injectPreamble && isHtml
                    ? InjectPreambleIntoHtml(file.Content, preambleOptions)
                    : file.Content;
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, content, 'utf8');
        }

        for (const asset of bundle.Assets) {
            const targetPath = resolveInsideRoot(rootDir, asset.RelativePath);
            const bytes = decodeBase64Strict(asset.DataBase64, asset.RelativePath);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, bytes);
        }

        if (injectPreamble) {
            await stageBundledDefaultFonts(rootDir);
        }

        let cleaned = false;
        return {
            RootDir: rootDir,
            EntryPath: entryPath,
            Cleanup: async (): Promise<void> => {
                if (cleaned) {
                    return;
                }
                cleaned = true;
                await fs.rm(rootDir, { recursive: true, force: true });
            },
        };
    } catch (error) {
        await fs.rm(rootDir, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }
}

/**
 * Injects the CSP `<meta>`, bundled default `@font-face` `<style>`, and `window.MJVideo`
 * preamble into every `.html` / `.htm` file of a bundle that was staged with `InjectPreamble: false`,
 * and stages the worker's bundled SIL OFL default fonts (`Inter` and `JetBrains Mono`) into `__mj_fonts/`.
 */
export async function ApplyPreambleToStagedBundle(
    rootDir: string,
    bundle: RenderProjectBundle,
    preambleOptions: PreambleRuntimeOptions,
): Promise<void> {
    await stageBundledDefaultFonts(rootDir);
    for (const file of bundle.Files) {
        if (!/\.html?$/i.test(file.Path)) {
            continue;
        }
        const targetPath = resolveInsideRoot(rootDir, file.Path);
        const withPreamble = InjectPreambleIntoHtml(file.Content, preambleOptions);
        await fs.writeFile(targetPath, withPreamble, 'utf8');
    }
}

async function stageBundledDefaultFonts(rootDir: string): Promise<void> {
    const destDir = path.join(rootDir, '__mj_fonts');
    await fs.mkdir(destDir, { recursive: true });
    for (const fileName of BUNDLED_FONT_FILES) {
        const srcPath = path.join(PACKAGE_FONTS_DIR, fileName);
        const destPath = path.join(destDir, fileName);
        await fs.copyFile(srcPath, destPath);
    }
}

function resolveInsideRoot(rootDir: string, relPath: string): string {
    ValidateBundleRelativePath(relPath, relPath);
    const resolvedRoot = path.resolve(rootDir);
    const resolvedTarget = path.resolve(resolvedRoot, ...relPath.split('/'));
    const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
    if (!resolvedTarget.startsWith(rootWithSep) || resolvedTarget === resolvedRoot) {
        throw new RenderWorkerError('InvalidBundle', `Resolved path "${relPath}" escapes bundle directory.`);
    }
    return resolvedTarget;
}

function registerUniqueRelativePath(seenLowerPaths: Set<string>, relPath: string): void {
    const key = relPath.toLowerCase();
    if (seenLowerPaths.has(key)) {
        throw new RenderWorkerError('InvalidBundle', `Duplicate bundle path "${relPath}".`);
    }
    seenLowerPaths.add(key);
}

/**
 * Validates that `dataBase64` is a well-formed base64 string and returns the decoded `Buffer`.
 */
export function ValidateStrictBase64(
    dataBase64: string,
    label: string,
    allowEmpty = true,
    errorCode: 'InvalidBundle' | 'InvalidRequest' = 'InvalidBundle',
): Buffer {
    if (typeof dataBase64 !== 'string') {
        throw new RenderWorkerError(errorCode, `${label} must be a base64 string.`);
    }
    const stripped = dataBase64.replace(/\s+/g, '');
    if (stripped.length === 0) {
        if (!allowEmpty) {
            throw new RenderWorkerError(errorCode, `${label} must be a non-empty base64 string.`);
        }
        return Buffer.alloc(0);
    }
    if (
        stripped.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(stripped)
    ) {
        throw new RenderWorkerError(errorCode, `${label} contains invalid base64 data.`);
    }
    return Buffer.from(stripped, 'base64');
}

function validateBase64String(dataBase64: string, label: string): void {
    ValidateStrictBase64(dataBase64, `Asset "${label}"`, true, 'InvalidBundle');
}

function decodeBase64Strict(dataBase64: string, label: string): Buffer {
    return ValidateStrictBase64(dataBase64, `Asset "${label}"`, true, 'InvalidBundle');
}

function expectedAspectRatio(format: VideoFormat): number {
    switch (format) {
        case '16:9':
            return 16 / 9;
        case '9:16':
            return 9 / 16;
        case '1:1':
            return 1;
        default:
            throw new RenderWorkerError('InvalidBundle', `Unsupported format "${String(format)}".`);
    }
}

/**
 * Shared entry helper used by `CaptureStills`, `RunCheckCli`, and `MeasureText` to ensure
 * `path.join(rootDir, 'index.html')` matches `entryFile` by always overwriting `index.html`
 * when `entryFile !== 'index.html'` (VS-RND-1 Fix 7b / VS-RND-5 Fix 5).
 */
export async function EnsureIndexHtmlForServer(rootDir: string, entryFile: string): Promise<void> {
    if (entryFile === 'index.html') {
        return;
    }
    const indexTarget = path.join(rootDir, 'index.html');
    await fs.copyFile(path.join(rootDir, entryFile), indexTarget);
}

