import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    BuildDataCheckInputs,
    BuildRenderDataSnapshot,
    WithChartKit,
    type CheckIssue,
    type CheckRequest,
    type RenderCompositionFile,
    type RenderProjectBundle,
    type RenderStagedAsset,
    type StillCapturePoint,
    type TypeSpec,
    type VideoAsset,
    type VideoAssetKind,
    type VideoFormat,
    type VideoGenerationSpec,
    type VideoRenderQuality,
} from '@memberjunction/video-studio-core';
import { LoadDataSnapshotValues } from '../data/data-snapshot.js';
import type { VideoStudioSettings } from '../settings.js';
import { ReadStoredFile } from '../storage.js';

/**
 * Maximum number of still capture points emitted by {@link StillPointsFor}.
 */
export const MAX_STILL_POINTS = 48;

/**
 * Context required by {@link BuildRenderBundle}.
 */
export interface BuildRenderBundleContext {
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
    /**
     * Optional pre-loaded data snapshot values. When omitted and `spec.DataSnapshot`
     * is present, `BuildRenderBundle` loads the values via {@link LoadDataSnapshotValues}.
     */
    Values?: Record<string, unknown>;
}

const FRAME_SIZES: Record<
    VideoRenderQuality,
    Record<VideoFormat, { Width: number; Height: number }>
> = {
    draft: {
        '16:9': { Width: 1280, Height: 720 },
        '9:16': { Width: 720, Height: 1280 },
        '1:1': { Width: 720, Height: 720 },
    },
    standard: {
        '16:9': { Width: 1920, Height: 1080 },
        '9:16': { Width: 1080, Height: 1920 },
        '1:1': { Width: 1080, Height: 1080 },
    },
    high: {
        '16:9': { Width: 2560, Height: 1440 },
        '9:16': { Width: 1440, Height: 2560 },
        '1:1': { Width: 1440, Height: 1440 },
    },
};

/**
 * Resolves the pixel dimensions (`Width`, `Height`) for a given aspect format and render quality tier.
 */
export function FrameSizeFor(
    format: VideoFormat,
    quality: VideoRenderQuality,
): { Width: number; Height: number } {
    const qualityMap = FRAME_SIZES[quality] ?? FRAME_SIZES.standard;
    const size = qualityMap[format] ?? qualityMap['16:9'];
    return { Width: size.Width, Height: size.Height };
}

/**
 * Computes up to {@link MAX_STILL_POINTS} (48) still capture points in priority order:
 * 1. Each beat's midpoint (`Role: 'BeatMidpoint'`)
 * 2. The last frame (`Role: 'Poster'`)
 * 3. `TransitionStart` / `TransitionEnd` (`0.1` s either side of each interior beat boundary)
 */
export function StillPointsFor(
    spec: Pick<VideoGenerationSpec, 'Beats' | 'Film'> & {
        Render?: Partial<VideoGenerationSpec['Render']>;
    },
): StillCapturePoint[] {
    const beats = Array.isArray(spec.Beats) ? spec.Beats : [];
    const points: StillCapturePoint[] = [];

    // 1. Beat midpoints
    for (const beat of beats) {
        if (points.length >= MAX_STILL_POINTS) {
            return points;
        }
        const midpoint = Number(((beat.StartSeconds + beat.EndSeconds) / 2).toFixed(4));
        points.push({
            Key: `${beat.Key}-mid`,
            TimestampSeconds: Math.max(0, midpoint),
            BeatKey: beat.Key,
            Role: 'BeatMidpoint',
            Label: beat.Label || beat.Key,
        });
    }

    // 2. Last frame (Poster)
    if (points.length < MAX_STILL_POINTS) {
        const lastBeat = beats.length > 0 ? beats[beats.length - 1] : undefined;
        const durationFromFilm =
            typeof spec.Film?.DurationSeconds === 'number' && spec.Film.DurationSeconds > 0
                ? spec.Film.DurationSeconds
                : undefined;
        const posterTimestamp =
            lastBeat !== undefined
                ? lastBeat.EndSeconds
                : (durationFromFilm ?? 0);

        points.push({
            Key: 'poster',
            TimestampSeconds: Math.max(0, posterTimestamp),
            ...(lastBeat ? { BeatKey: lastBeat.Key } : {}),
            Role: 'Poster',
            Label: 'Poster',
        });
    }

    // 3. Interior beat transition boundaries (0.1 s before and after each interior boundary)
    for (let i = 0; i < beats.length - 1; i++) {
        if (points.length >= MAX_STILL_POINTS) {
            break;
        }
        const currentBeat = beats[i];
        const nextBeat = beats[i + 1];
        const boundary = currentBeat.EndSeconds;

        const startTs = Math.max(0, Number((boundary - 0.1).toFixed(4)));
        points.push({
            Key: `${currentBeat.Key}-transition-start`,
            TimestampSeconds: startTs,
            BeatKey: currentBeat.Key,
            Role: 'TransitionStart',
            Label: `${currentBeat.Key} transition start`,
        });

        if (points.length >= MAX_STILL_POINTS) {
            break;
        }

        const endTs = Math.max(0, Number((boundary + 0.1).toFixed(4)));
        points.push({
            Key: `${nextBeat.Key}-transition-end`,
            TimestampSeconds: endTs,
            BeatKey: nextBeat.Key,
            Role: 'TransitionEnd',
            Label: `${nextBeat.Key} transition end`,
        });
    }

    return points.slice(0, MAX_STILL_POINTS);
}

interface ArtifactVersionViewRow {
    ID: string;
    FileID?: string | null;
    MimeType?: string | null;
}

/**
 * Reads the binary bytes for an approved video asset from either its `FileID`
 * or a file-backed `MJ: Artifact Versions` row identified by `ArtifactVersionID`.
 * Throws an `Error` naming `asset.Key` if neither source resolves to stored bytes.
 */
export async function ReadAssetBytes(
    asset: Pick<VideoAsset, 'Key' | 'FileID' | 'ArtifactVersionID'>,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<{ Bytes: Buffer; MimeType?: string }> {
    const fileId = asset.FileID?.trim();
    if (fileId) {
        const bytes = await ReadStoredFile(fileId, contextUser, provider);
        return { Bytes: bytes };
    }

    const artifactVersionId = asset.ArtifactVersionID?.trim();
    if (artifactVersionId) {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const escapedId = artifactVersionId.replace(/'/g, "''");
        const result = await rv.RunView<ArtifactVersionViewRow>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID = '${escapedId}'`,
                Fields: ['ID', 'FileID', 'MimeType'],
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!result.Success) {
            throw new Error(
                `Failed to load ArtifactVersion "${artifactVersionId}" for asset "${asset.Key}": ${result.ErrorMessage ?? 'RunView failed'}`,
            );
        }
        const row = (result.Results ?? [])[0];
        const rowFileId = row?.FileID?.trim();
        if (!row || !rowFileId) {
            throw new Error(
                `Asset "${asset.Key}" references ArtifactVersion "${artifactVersionId}" which is not backed by a FileID.`,
            );
        }
        const bytes = await ReadStoredFile(rowFileId, contextUser, provider);
        const mimeType = row.MimeType?.trim();
        return {
            Bytes: bytes,
            ...(mimeType ? { MimeType: mimeType } : {}),
        };
    }

    throw new Error(
        `Asset "${asset.Key}" has neither a FileID nor an ArtifactVersionID and cannot be read.`,
    );
}

/**
 * Sanitizes an asset or narration line key into a lowercase safe filename stem (`[a-z0-9-_]`).
 */
export function SanitizeStageKey(key: string): string {
    const cleaned = (key ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || 'item';
}

function inferMimeTypeFromPathOrKind(stagedPath: string, kind: VideoAssetKind): string {
    const lower = stagedPath.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.woff2')) return 'font/woff2';
    if (lower.endsWith('.woff')) return 'font/woff';
    if (lower.endsWith('.ttf')) return 'font/ttf';
    if (lower.endsWith('.otf')) return 'font/otf';
    if (lower.endsWith('.json')) return 'application/json';

    switch (kind) {
        case 'Logo':
        case 'LogoMark':
        case 'Image':
        case 'Screenshot':
            return 'image/png';
        case 'Video':
            return 'video/mp4';
        case 'Music':
        case 'SoundEffect':
            return 'audio/mpeg';
        case 'Font':
            return 'font/woff2';
        default:
            return 'application/octet-stream';
    }
}

function resolveFontFamilyForAsset(
    spec: VideoGenerationSpec,
    assetKey: string,
): string {
    const typography: readonly TypeSpec[] = Array.isArray(spec.Style?.Typography)
        ? spec.Style.Typography
        : [];
    for (const entry of typography) {
        if (entry && entry.FontAssetKey === assetKey && entry.FontFamily?.trim()) {
            return entry.FontFamily.trim();
        }
    }
    return assetKey;
}

function buildFontsCss(spec: VideoGenerationSpec, approvedAssets: readonly VideoAsset[]): string {
    const blocks: string[] = [];
    for (const asset of approvedAssets) {
        if (asset.Kind !== 'Font' || !asset.StagedPath?.trim()) {
            continue;
        }
        const family = resolveFontFamilyForAsset(spec, asset.Key);
        const stagedPath = asset.StagedPath.trim();
        blocks.push(
            `@font-face {\n  font-family: '${family}';\n  src: url('${stagedPath}');\n  font-display: block;\n}`,
        );
    }
    return blocks.length > 0 ? `${blocks.join('\n\n')}\n` : '/* mj/fonts.css: no staged kit fonts */\n';
}

/**
 * Assembles a self-contained {@link RenderProjectBundle} for `format` without mutating `spec`:
 * - Collects `Output.Source[format].Files`
 * - Stages every approved asset with a `StagedPath` + every narration line with an `AudioFileID`
 * - Builds `DataSnapshot` via {@link BuildRenderDataSnapshot}
 * - Sets `Seed` from `spec.Render.Seed` (default `1`)
 * - Injects `mj/chart-kit.js` via {@link WithChartKit} and `mj/fonts.css` with one `@font-face` per staged `Font` asset
 */
export async function BuildRenderBundle(
    spec: VideoGenerationSpec,
    format: VideoFormat,
    ctx: BuildRenderBundleContext,
): Promise<RenderProjectBundle> {
    const source = spec.Output?.Source?.[format];
    if (!source || !source.Files || typeof source.Files !== 'object') {
        throw new Error(`Output.Source["${format}"] is missing or has no Files map.`);
    }

    const files: RenderCompositionFile[] = Object.entries(source.Files).map(([filePath, content]) => ({
        Path: filePath,
        Content: content,
    }));

    const assets: RenderStagedAsset[] = [];
    const approvedAssets = Array.isArray(spec.Assets?.Approved) ? spec.Assets.Approved : [];

    for (const asset of approvedAssets) {
        const stagedPath = asset.StagedPath?.trim();
        if (!stagedPath) {
            continue;
        }
        const { Bytes, MimeType } = await ReadAssetBytes(asset, ctx.ContextUser, ctx.Provider);
        assets.push({
            Key: asset.Key,
            RelativePath: stagedPath,
            DataBase64: Bytes.toString('base64'),
            MimeType: MimeType ?? inferMimeTypeFromPathOrKind(stagedPath, asset.Kind),
        });
    }

    const narrationScript = Array.isArray(spec.Audio?.Narration?.Script)
        ? spec.Audio.Narration.Script
        : [];
    for (const line of narrationScript) {
        const audioFileId = line.AudioFileID?.trim();
        if (!audioFileId) {
            continue;
        }
        const bytes = await ReadStoredFile(audioFileId, ctx.ContextUser, ctx.Provider);
        const relativePath =
            line.StagedPath?.trim() || `audio/${SanitizeStageKey(line.Key)}.mp3`;
        assets.push({
            Key: line.Key,
            RelativePath: relativePath,
            DataBase64: bytes.toString('base64'),
            MimeType: 'audio/mpeg',
        });
    }

    let dataSnapshot: Record<string, unknown> = {};
    if (ctx.Values !== undefined) {
        dataSnapshot = BuildRenderDataSnapshot(ctx.Values, spec.DataSnapshot?.AsOf);
    } else if (spec.DataSnapshot) {
        const loadedValues = await LoadDataSnapshotValues(spec.DataSnapshot, {
            ContextUser: ctx.ContextUser,
            Provider: ctx.Provider,
        });
        dataSnapshot = BuildRenderDataSnapshot(loadedValues, spec.DataSnapshot.AsOf);
    }

    const seed = typeof spec.Render?.Seed === 'number' ? spec.Render.Seed : 1;
    const entryFile = source.EntryFile?.trim() || 'index.html';

    const withChartKit = WithChartKit({
        Format: format,
        EntryFile: entryFile,
        Files: files,
        Assets: assets,
        DataSnapshot: dataSnapshot,
        Seed: seed,
    });

    const fontsCss = buildFontsCss(spec, approvedAssets);
    const filteredFiles = withChartKit.Files.filter((f) => f.Path !== 'mj/fonts.css');

    return {
        ...withChartKit,
        Files: [...filteredFiles, { Path: 'mj/fonts.css', Content: fontsCss }],
    };
}

/**
 * Builds the worker {@link CheckRequest} for `format` by combining {@link FrameSizeFor},
 * `bundle`, and {@link BuildDataCheckInputs}.
 */
export function BuildCheckRequest(
    spec: VideoGenerationSpec,
    format: VideoFormat,
    bundle: RenderProjectBundle,
    values: Record<string, unknown>,
): CheckRequest {
    const quality = spec.Render?.Quality ?? 'standard';
    const { Width, Height } = FrameSizeFor(format, quality);
    const dataCheckInputs = BuildDataCheckInputs(spec, values);

    return {
        Bundle: bundle,
        Width,
        Height,
        ...dataCheckInputs,
    };
}

/**
 * Pure pre-render production checks that validate rules the headless browser worker does not inspect:
 * - `Provenance` / `'Error'`: any `Assets.Approved` with `Provenance === 'Generated'` missing `Generation`
 *   (or missing `ModelID`, `PromptRunID`, or `Prompt`)
 * - `Provenance` / `'Error'`: sum of `Generation.DurationSeconds` across generated `Video` assets
 *   exceeding `settings.MaxGeneratedVideoSeconds`
 * - `Audio` / `'Error'`: any narration line in `Audio.Narration.Script` missing `AudioFileID`
 * - `Audio` / `'Error'`: `Audio.Music.AssetKey` is set and the matching asset in `Assets.Approved`
 *   is missing or has no `StagedPath`
 */
export function CheckProductionRules(
    spec: VideoGenerationSpec,
    settings: Pick<VideoStudioSettings, 'MaxGeneratedVideoSeconds'>,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const approvedAssets = Array.isArray(spec.Assets?.Approved) ? spec.Assets.Approved : [];

    let totalGeneratedVideoSeconds = 0;

    for (const asset of approvedAssets) {
        if (asset.Provenance === 'Generated') {
            const gen = asset.Generation;
            if (
                !gen ||
                !gen.ModelID?.trim() ||
                !gen.PromptRunID?.trim() ||
                !gen.Prompt?.trim()
            ) {
                issues.push({
                    Code: 'MissingGeneratedAssetProvenance',
                    Category: 'Provenance',
                    Severity: 'Error',
                    Message: `Generated asset "${asset.Key}" is missing required Generation provenance metadata (ModelID, PromptRunID, Prompt).`,
                });
            }
            if (asset.Kind === 'Video' && typeof gen?.DurationSeconds === 'number' && gen.DurationSeconds > 0) {
                totalGeneratedVideoSeconds += gen.DurationSeconds;
            }
        }
    }

    if (totalGeneratedVideoSeconds > settings.MaxGeneratedVideoSeconds) {
        issues.push({
            Code: 'MaxGeneratedVideoSecondsExceeded',
            Category: 'Provenance',
            Severity: 'Error',
            Message: `Total generated video duration (${totalGeneratedVideoSeconds}s) exceeds MaxGeneratedVideoSeconds (${settings.MaxGeneratedVideoSeconds}s).`,
        });
    }

    const narrationScript = Array.isArray(spec.Audio?.Narration?.Script)
        ? spec.Audio.Narration.Script
        : [];
    for (const line of narrationScript) {
        if (!line.AudioFileID?.trim()) {
            issues.push({
                Code: 'MissingNarrationAudio',
                Category: 'Audio',
                Severity: 'Error',
                Message: `Narration line "${line.Key}" (beat "${line.BeatKey}") has no synthesized AudioFileID.`,
            });
        }
    }

    const musicAssetKey = spec.Audio?.Music?.AssetKey?.trim();
    if (musicAssetKey) {
        const musicAsset = approvedAssets.find((a) => a.Key === musicAssetKey);
        if (!musicAsset || !musicAsset.StagedPath?.trim()) {
            issues.push({
                Code: 'UnstagedMusicAsset',
                Category: 'Audio',
                Severity: 'Error',
                Message: `Audio.Music.AssetKey "${musicAssetKey}" is not present in Assets.Approved with a StagedPath.`,
            });
        }
    }

    return issues;
}
