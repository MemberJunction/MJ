import { UUIDsEqual } from '@memberjunction/global';
import type {
    CachedPublishedVersion,
    RubricLevelAnchorSnapshot,
    RubricNodeSnapshot,
    RubricScaleLevelSnapshot,
    RubricScaleSnapshot,
} from '@memberjunction/rubrics-base';
import {
    BuildBoundDataLiterals,
    CreateMJChartKit,
    DescribeGeneratedAssets,
    type AudioCue,
    type NarrationLine,
    type VideoBeat,
    type VideoDataBinding,
    type VideoDefect,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

const MAX_GRIDS_PER_CALL = 4;
const CHART_KIT = CreateMJChartKit();

/**
 * Renders every `Criterion` node in a published rubric tree as a bulleted plain-text list
 * suitable for the `Video Studio - Critic` prompt's `rubricCriteria` template variable.
 *
 * Includes version-level `instructions` (when present), per-criterion `[GATE]` flags, and
 * `Meets` / `Partial` / `Miss` level anchor descriptions. `Group` nodes are omitted.
 */
export function BuildRubricCriteriaText(version: CachedPublishedVersion): string {
    const instructions = (version.instructions ?? '').trim();

    const lines: string[] = [];
    if (instructions.length > 0) {
        lines.push(`Instructions: ${instructions}`);
    }

    for (const node of version.nodes) {
        if (node.nodeType !== 'Criterion') {
            continue;
        }
        const description = (node.description ?? '').trim();
        const guidance = (node.guidance ?? '').trim();
        const details = [description, guidance].filter((part) => part.length > 0).join(' ');
        const gateTag = node.isGate ? ' [GATE]' : '';
        const scale = findScaleForNode(version.scales, node.scaleId);
        const levelText = formatCriterionLevels(node, scale);
        const levelSuffix = levelText ? ` | Levels — ${levelText}` : '';
        lines.push(
            `- ${node.key}${gateTag} (${node.name}, weight ${node.weight}): ${details}${levelSuffix}`.trimEnd(),
        );
    }
    return lines.join('\n');
}

export function findScaleForNode(
    scales: readonly RubricScaleSnapshot[],
    scaleId: string | null | undefined,
): RubricScaleSnapshot | undefined {
    if (!scaleId) {
        return undefined;
    }
    return scales.find((candidate) => UUIDsEqual(candidate.id, scaleId));
}

function findScaleLevel(
    scale: RubricScaleSnapshot | undefined,
    scaleLevelId: string,
): RubricScaleLevelSnapshot | undefined {
    if (!scale || !scaleLevelId) {
        return undefined;
    }
    return scale.levels.find((lvl) => UUIDsEqual(lvl.id, scaleLevelId));
}

function formatCriterionLevels(
    node: RubricNodeSnapshot,
    scale: RubricScaleSnapshot | undefined,
): string {
    const anchors: readonly RubricLevelAnchorSnapshot[] = node.anchors ?? [];

    if (anchors.length === 0) {
        if (!scale || scale.levels.length === 0) {
            return '';
        }
        const levelLabels = [...scale.levels]
            .sort((a, b) => b.sequence - a.sequence)
            .map((lvl) =>
                lvl.description?.trim() ? `${lvl.label}: ${lvl.description.trim()}` : lvl.label,
            );
        return levelLabels.join('; ');
    }

    const parts: string[] = [];
    for (const anchor of anchors) {
        const descriptor = (anchor.descriptor ?? '').trim();
        if (!descriptor) {
            continue;
        }
        const rawLevelId = (anchor.scaleLevelId ?? '').trim();
        const matchedLevel = findScaleLevel(scale, rawLevelId);
        const label = matchedLevel?.label ?? (rawLevelId || 'Level');
        parts.push(`${label}: ${descriptor}`);
    }
    return parts.join('; ');
}

/**
 * Formats `Beats` into a markdown table for the Critic prompt (`beatsTable`).
 */
export function BuildBeatsTable(spec: Partial<VideoGenerationSpec>): string {
    const beats: VideoBeat[] = spec.Beats ?? [];
    if (beats.length === 0) {
        return '(no beats)';
    }

    const header =
        '| Key | Label | Start (s) | End (s) | Duration (s) | Purpose | On-Screen Text | Data Refs | Asset Refs |';
    const divider = '| --- | --- | --- | --- | --- | --- | --- | --- | --- |';
    const rows = beats.map((beat) => {
        const start = typeof beat.StartSeconds === 'number' ? beat.StartSeconds : 0;
        const end = typeof beat.EndSeconds === 'number' ? beat.EndSeconds : start;
        const duration = Math.max(0, end - start);
        const onScreen = (beat.OnScreenText ?? []).join(' / ') || '—';
        const dataRefs = (beat.DataRefs ?? []).join(', ') || '—';
        const assetRefs = (beat.AssetRefs ?? []).join(', ') || '—';
        return `| ${escapeCell(beat.Key)} | ${escapeCell(beat.Label)} | ${start.toFixed(2)} | ${end.toFixed(2)} | ${duration.toFixed(2)} | ${escapeCell(beat.Purpose ?? '')} | ${escapeCell(onScreen)} | ${escapeCell(dataRefs)} | ${escapeCell(assetRefs)} |`;
    });

    return [header, divider, ...rows].join('\n');
}

/**
 * Formats narration lines (with start/end seconds and text) followed by audio cues (with timestamps)
 * for the Critic prompt (`timelineTable`).
 */
export function BuildTimelineTable(spec: Partial<VideoGenerationSpec>): string {
    const narrationLines: NarrationLine[] = spec.Audio?.Narration?.Script ?? [];
    const cues: AudioCue[] = spec.Audio?.Cues ?? [];
    const sections: string[] = [];

    if (narrationLines.length > 0) {
        const header = '| Line Key | Beat | Start (s) | End (s) | Text |';
        const divider = '| --- | --- | --- | --- | --- |';
        const rows = narrationLines.map((line) => {
            const start = typeof line.StartSeconds === 'number' ? line.StartSeconds : 0;
            const duration = typeof line.DurationSeconds === 'number' ? line.DurationSeconds : 0;
            const end = start + duration;
            return `| ${escapeCell(line.Key)} | ${escapeCell(line.BeatKey)} | ${start.toFixed(2)} | ${end.toFixed(2)} | ${escapeCell(line.Text)} |`;
        });
        sections.push(['### Narration', header, divider, ...rows].join('\n'));
    } else {
        sections.push('### Narration\n(no narration lines)');
    }

    if (cues.length > 0) {
        const header = '| Cue Key | Time (s) | Kind | Beat | Asset | Notes |';
        const divider = '| --- | --- | --- | --- | --- | --- |';
        const rows = cues.map((cue) => {
            const time =
                typeof cue.TimestampSeconds === 'number' ? cue.TimestampSeconds.toFixed(2) : '0.00';
            return `| ${escapeCell(cue.Key)} | ${time} | ${escapeCell(cue.Kind)} | ${escapeCell(cue.BeatKey ?? '—')} | ${escapeCell(cue.AssetKey ?? '—')} | ${escapeCell(cue.Notes ?? '—')} |`;
        });
        sections.push(['### Audio Cues', header, divider, ...rows].join('\n'));
    } else {
        sections.push('### Audio Cues\n(no audio cues)');
    }

    return sections.join('\n\n');
}

/**
 * Formats `DataBindings` alongside their resolved and formatted snapshot values (`boundValues`).
 */
export function BuildBoundValuesTable(
    spec: Partial<VideoGenerationSpec>,
    snapshot: Record<string, unknown>,
): string {
    const bindings: VideoDataBinding[] = spec.DataBindings ?? [];
    if (bindings.length === 0) {
        return '(no bound data values)';
    }

    const header = '| Key | Label | Formatted Value |';
    const divider = '| --- | --- | --- |';
    const rows = bindings.map((binding) => {
        const rawValue = snapshot?.[binding.Key];
        const formatted = formatBindingSnapshotValue(binding, rawValue, snapshot);
        const label = binding.Label ?? binding.Key;
        return `| ${escapeCell(binding.Key)} | ${escapeCell(label)} | ${escapeCell(formatted)} |`;
    });

    return [header, divider, ...rows].join('\n');
}

function formatBindingSnapshotValue(
    binding: VideoDataBinding,
    rawValue: unknown,
    snapshot: Record<string, unknown>,
): string {
    if (typeof rawValue === 'number' || typeof rawValue === 'string') {
        return CHART_KIT.FormatValue(rawValue, binding.Format);
    }
    if (rawValue !== null && rawValue !== undefined) {
        const literals = BuildBoundDataLiterals([binding], snapshot)[binding.Key] ?? [];
        if (literals.length > 0) {
            return literals.join(', ');
        }
    }
    return CHART_KIT.FormatValue(Number.NaN, binding.Format);
}

/**
 * Picks at most 5 contact sheet file IDs for a single critic prompt call:
 * the first 4 grid sheets plus the transition strip (the last ID in `fileIds`).
 */
export function PickSheetsForCall(fileIds: readonly string[]): string[] {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return [];
    }
    if (fileIds.length <= MAX_GRIDS_PER_CALL + 1) {
        return [...fileIds];
    }
    const grids = fileIds.slice(0, MAX_GRIDS_PER_CALL);
    const strip = fileIds[fileIds.length - 1];
    return [...grids, strip];
}

/**
 * Builds the `repairBrief` template parameter injected into `Motion Engineer` when the newest
 * critic round has `Open` defects.
 */
export function BuildRepairBrief(spec: Partial<VideoGenerationSpec>): string {
    const rounds = spec.Review?.Rounds ?? [];
    if (rounds.length === 0) {
        return '';
    }
    const newestRound = rounds[rounds.length - 1];
    const openDefects: VideoDefect[] = (newestRound?.Defects ?? []).filter(
        (defect): defect is VideoDefect => Boolean(defect && defect.Status === 'Open'),
    );
    if (openDefects.length === 0) {
        return '';
    }

    const lines = openDefects.map((defect) => {
        const fmt = escapeCell(defect.Format ?? 'default') || 'default';
        const beat = escapeCell(defect.Beat ?? '');
        const criterion = defect.Criterion ? ` [criterion: ${escapeCell(defect.Criterion)}]` : '';
        const evidence = escapeCell(defect.Evidence ?? '');
        const fix = escapeCell(defect.Fix ?? '');
        return `- [${defect.Severity}] format ${fmt}, beat ${beat}, ${defect.Timestamp}s${criterion}: ${evidence} — Fix: ${fix}`;
    });

    return [
        ...lines,
        '',
        'Patch only these sections. Keep every other part of the composition unchanged.',
    ].join('\n');
}

/**
 * Formats approved generated assets into a markdown table for the Critic prompt
 * (`generatedAssetsTable`), or returns `''` when no generated assets exist.
 */
export function BuildGeneratedAssetsTable(spec: Partial<VideoGenerationSpec>): string {
    const disclosure = DescribeGeneratedAssets(spec);
    if (disclosure.Items.length === 0) {
        return '';
    }

    const header = '| Key | Kind | Beats | Time Ranges | Prompt |';
    const divider = '| --- | --- | --- | --- | --- |';
    const rows = disclosure.Items.map((item) => {
        const beats =
            item.Beats.length > 0
                ? item.Beats.map((b) => escapeCell(b.Key)).join(', ')
                : '—';
        const timeRanges =
            item.Beats.length > 0
                ? item.Beats
                      .map((b) => `${b.StartSeconds.toFixed(2)}s-${b.EndSeconds.toFixed(2)}s`)
                      .join(', ')
                : '—';
        return `| ${escapeCell(item.Key)} | ${escapeCell(item.Kind)} | ${beats} | ${timeRanges} | ${escapeCell(item.Prompt)} |`;
    });

    return [header, divider, ...rows].join('\n');
}

function escapeCell(value: string): string {
    return (value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

