import {
    VideoGenerationProvenanceSummary,
    VideoGenerationSpec,
} from './video-generation-spec.js';

export interface GeneratedAssetBeatPlacement {
    Key: string;
    StartSeconds: number;
    EndSeconds: number;
}

export interface GeneratedAssetDisclosureItem {
    Key: string;
    Kind: 'Image' | 'Video';
    Beats: GeneratedAssetBeatPlacement[];
    ModelID: string;
    PromptRunID: string;
    Prompt: string;
    Seed?: number;
    ReferenceKeys: string[];
    DurationSeconds?: number;
    Cost?: number;
    C2PA: boolean;
}

export interface GeneratedAssetDisclosureSummary {
    Items: GeneratedAssetDisclosureItem[];
    ClipCount: number;
    ImageCount: number;
    TotalVideoSeconds: number;
    TotalCost: number;
    /** Ready-to-render header pill copy, or `null` when `Items.length === 0`. */
    SummaryLine: string | null;
}

/**
 * Pure, deterministic provenance projection over a `VideoGenerationSpec` (D20).
 * Reads `Spec.Assets.Approved` where `Provenance === 'Generated'` and joins each
 * asset to `Spec.Beats` via `Beat.AssetRefs`.
 */
export function DescribeGeneratedAssets(
    spec: Partial<VideoGenerationSpec>,
): GeneratedAssetDisclosureSummary {
    const approved = Array.isArray(spec?.Assets?.Approved) ? spec.Assets.Approved : [];
    const beats = Array.isArray(spec?.Beats) ? spec.Beats : [];

    const items: GeneratedAssetDisclosureItem[] = [];
    let clipCount = 0;
    let imageCount = 0;
    let totalVideoSeconds = 0;
    let totalCost = 0;

    for (const asset of approved) {
        if (!asset || asset.Provenance !== 'Generated') {
            continue;
        }
        const kind: 'Image' | 'Video' = asset.Kind === 'Video' ? 'Video' : 'Image';
        const gen = asset.Generation;
        const beatPlacements: GeneratedAssetBeatPlacement[] = [];

        for (const beat of beats) {
            if (!beat || !Array.isArray(beat.AssetRefs)) {
                continue;
            }
            if (beat.AssetRefs.includes(asset.Key)) {
                beatPlacements.push({
                    Key: beat.Key,
                    StartSeconds: typeof beat.StartSeconds === 'number' ? beat.StartSeconds : 0,
                    EndSeconds: typeof beat.EndSeconds === 'number' ? beat.EndSeconds : 0,
                });
            }
        }

        const durationSeconds =
            typeof gen?.DurationSeconds === 'number' && Number.isFinite(gen.DurationSeconds)
                ? gen.DurationSeconds
                : undefined;
        const cost =
            typeof gen?.Cost === 'number' && Number.isFinite(gen.Cost)
                ? gen.Cost
                : undefined;

        const item: GeneratedAssetDisclosureItem = {
            Key: asset.Key,
            Kind: kind,
            Beats: beatPlacements,
            ModelID: typeof gen?.ModelID === 'string' ? gen.ModelID : '',
            PromptRunID: typeof gen?.PromptRunID === 'string' ? gen.PromptRunID : '',
            Prompt: typeof gen?.Prompt === 'string' ? gen.Prompt : '',
            ...(typeof gen?.Seed === 'number' && Number.isFinite(gen.Seed) ? { Seed: gen.Seed } : {}),
            ReferenceKeys: Array.isArray(gen?.ReferenceKeys) ? [...gen.ReferenceKeys] : [],
            ...(durationSeconds !== undefined ? { DurationSeconds: durationSeconds } : {}),
            ...(cost !== undefined ? { Cost: cost } : {}),
            C2PA: gen?.C2PA === true,
        };

        items.push(item);

        if (kind === 'Video') {
            clipCount += 1;
            if (durationSeconds !== undefined) {
                totalVideoSeconds += durationSeconds;
            }
        } else {
            imageCount += 1;
        }

        if (cost !== undefined) {
            totalCost += cost;
        }
    }

    const summaryLine = buildSummaryLine(clipCount, imageCount, totalVideoSeconds);

    return {
        Items: items,
        ClipCount: clipCount,
        ImageCount: imageCount,
        TotalVideoSeconds: totalVideoSeconds,
        TotalCost: totalCost,
        SummaryLine: summaryLine,
    };
}

function buildSummaryLine(
    clipCount: number,
    imageCount: number,
    totalVideoSeconds: number,
): string | null {
    if (clipCount === 0 && imageCount === 0) {
        return null;
    }
    const roundedSeconds = Math.round(totalVideoSeconds);
    const clipWord = clipCount === 1 ? 'clip' : 'clips';
    const imageWord = imageCount === 1 ? 'image' : 'images';

    if (clipCount > 0 && imageCount === 0) {
        return `Contains AI-generated footage: ${clipCount} ${clipWord}, ${roundedSeconds} s`;
    }
    if (clipCount === 0 && imageCount > 0) {
        return `Contains AI-generated images: ${imageCount}`;
    }
    return `Contains AI-generated footage (${clipCount} ${clipWord}, ${roundedSeconds} s) and ${imageCount} ${imageWord}`;
}

/**
 * Builds the `Spec.Output.GenerationProvenance` summary from `Spec.Assets.Approved`,
 * or returns `undefined` when no generated assets are present.
 */
export function BuildGenerationProvenanceSummary(
    spec: Partial<VideoGenerationSpec>,
): VideoGenerationProvenanceSummary | undefined {
    const summary = DescribeGeneratedAssets(spec);
    if (summary.Items.length === 0) {
        return undefined;
    }
    return {
        Assets: summary.Items.map((item) => ({
            AssetKey: item.Key,
            Kind: item.Kind,
            ModelID: item.ModelID,
            PromptRunID: item.PromptRunID,
            ...(item.DurationSeconds !== undefined ? { DurationSeconds: item.DurationSeconds } : {}),
            ...(item.Cost !== undefined ? { Cost: item.Cost } : {}),
            C2PA: item.C2PA,
        })),
        TotalVideoSeconds: summary.TotalVideoSeconds,
        TotalCost: summary.TotalCost,
    };
}
