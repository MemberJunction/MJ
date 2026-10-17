import type { RubricNodeSnapshot } from '@memberjunction/rubrics-base';
import {
    BuildBoundDataLiterals,
    CreateMJChartKit,
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
 * `Group` nodes are omitted. Each criterion line follows:
 * `- <key> (<name>, weight <w>): <description> <guidance>`
 */
export function BuildRubricCriteriaText(nodes: readonly RubricNodeSnapshot[]): string {
    const lines: string[] = [];
    for (const node of nodes ?? []) {
        if (!node || node.nodeType !== 'Criterion') {
            continue;
        }
        const description = (node.description ?? '').trim();
        const guidance = (node.guidance ?? '').trim();
        const details = [description, guidance].filter((part) => part.length > 0).join(' ');
        lines.push(`- ${node.key} (${node.name}, weight ${node.weight}): ${details}`.trimEnd());
    }
    return lines.join('\n');
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
        const fmt = defect.Format ?? 'default';
        const criterion = defect.Criterion ? ` [criterion: ${defect.Criterion}]` : '';
        return `- [${defect.Severity}] format ${fmt}, beat ${defect.Beat}, ${defect.Timestamp}s${criterion}: ${defect.Evidence} — Fix: ${defect.Fix}`;
    });

    return [
        ...lines,
        '',
        'Patch only these sections. Keep every other part of the composition unchanged.',
    ].join('\n');
}

function escapeCell(value: string): string {
    return (value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}
