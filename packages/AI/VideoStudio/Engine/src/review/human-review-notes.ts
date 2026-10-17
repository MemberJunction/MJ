import { AIEngine } from '@memberjunction/aiengine';
import { UUIDsEqual } from '@memberjunction/global';
import {
    DescribeGeneratedAssets,
    type VideoDefect,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

/**
 * Composes the plain-text `Review.HumanReviewNotes` summary for a Video Studio production.
 *
 * Sections:
 * - Deferred defects from the newest critic round (`Deferred defects (n)` with one line per defect),
 *   or `No open defects.` when none remain.
 * - Generated asset disclosure when `Assets.Approved` contains generated assets.
 * - Inline storage warning (`Storage`) when any `Output.Videos` entry uses `InlineBase64`.
 */
export function ComposeHumanReviewNotes(spec: Partial<VideoGenerationSpec>): string {
    const rounds = spec.Review?.Rounds ?? [];
    const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
    const unresolvedDefects: VideoDefect[] = (latestRound?.Defects ?? []).filter(
        (d): d is VideoDefect => Boolean(d && (d.Status === 'Deferred' || d.Status === 'Open')),
    );

    const sections: string[] = [];

    if (unresolvedDefects.length > 0) {
        const lines = unresolvedDefects.map((d) => {
            const fmt = d.Format ?? 'default';
            return `[${d.Severity}] ${fmt} at ${d.Timestamp}s, beat ${d.Beat}: ${d.Evidence}. Suggested fix: ${d.Fix}`;
        });
        sections.push([`Deferred defects (${unresolvedDefects.length})`, ...lines].join('\n'));
    } else {
        sections.push('No open defects.');
    }

    const disclosure = DescribeGeneratedAssets(spec);
    if (disclosure.Items.length > 0) {
        const lines = disclosure.Items.map((item) => {
            const secondsPart =
                item.DurationSeconds !== undefined ? `${item.DurationSeconds}s` : '—';
            const beatsPart =
                item.Beats.length > 0
                    ? item.Beats
                          .map((b) => `${b.Key} (${b.StartSeconds}s-${b.EndSeconds}s)`)
                          .join(', ')
                    : 'none';
            const modelLabel = resolveModelName(item.ModelID);
            const c2paLabel = item.C2PA ? 'C2PA: kept' : 'C2PA: none';
            return `- ${item.Key} (${item.Kind}, ${secondsPart}): beats [${beatsPart}], model ${modelLabel}, ${c2paLabel}`;
        });
        sections.push([`AI-generated assets (${disclosure.Items.length})`, ...lines].join('\n'));
    }

    const videos = spec.Output?.Videos ?? {};
    const inlineEntries: string[] = [];
    for (const [fmtKey, video] of Object.entries(videos)) {
        if (video && typeof video.InlineBase64 === 'string' && video.InlineBase64.trim().length > 0) {
            const fmt = video.Format || fmtKey;
            const bytes =
                typeof video.FileSizeBytes === 'number' && video.FileSizeBytes > 0
                    ? video.FileSizeBytes
                    : Buffer.byteLength(video.InlineBase64, 'base64');
            const mb = (bytes / (1024 * 1024)).toFixed(1);
            inlineEntries.push(`${fmt} (${mb} MB)`);
        }
    }
    if (inlineEntries.length > 0) {
        sections.push(
            [
                'Storage',
                `Stored inline in the database, not in file storage: ${inlineEntries.join(', ')}. Set up file storage before sharing this production.`,
            ].join('\n'),
        );
    }

    return sections.join('\n\n');
}

function resolveModelName(modelId: string): string {
    if (!modelId) {
        return 'unknown';
    }
    try {
        const models = AIEngine.Instance?.Models;
        if (Array.isArray(models)) {
            const match = models.find((m) => UUIDsEqual(m.ID, modelId));
            if (match?.Name?.trim()) {
                return match.Name.trim();
            }
        }
    } catch {
        // AIEngine not initialized; fall back to ModelID
    }
    return modelId;
}

