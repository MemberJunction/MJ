import type { VideoDefect, VideoGenerationSpec } from '@memberjunction/video-studio-core';

/**
 * Composes the plain-text `Review.HumanReviewNotes` summary for a Video Studio production.
 *
 * Sections:
 * - Deferred defects from the newest critic round (`Deferred defects (n)` with one line per defect),
 *   or `No open defects.` when none remain.
 * - Generated asset disclosure when `Assets.Approved` contains generated assets.
 *
 * Subsequent tasks (VS-ART-2 inline-storage warning, VS-GEN-7 generated-asset details) extend this function.
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

    const genAssets = (spec.Assets?.Approved ?? []).filter((a) => a?.Provenance === 'Generated');
    if (genAssets.length > 0) {
        sections.push(`Generated assets disclosed: ${genAssets.map((a) => a.Key).join(', ')}.`);
    }

    return sections.join('\n\n');
}
