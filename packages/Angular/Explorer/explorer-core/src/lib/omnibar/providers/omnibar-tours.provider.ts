import { RegisterClass } from '@memberjunction/global';
import type { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import { TourSignals } from '@memberjunction/tours-runtime';
import { OmnibarProvider, GetOmnibarNavPayload, OMNIBAR_NAV_KEY, OmnibarNavPayload } from '../omnibar-provider';
import { OmnibarSemanticIndexService } from '../omnibar-semantic-index.service';

const HOW_DO_I_PATTERN = /^(?:how\s+do\s+i|how\s+to)\b\s*/i;

/**
 * Checks whether a query is a "how do I ..." / "how to ..." help query, emits a
 * `core.omnibar.howDoISearch` signal to `TourSignals` when true, and returns the
 * normalized search needle.
 */
export function ExtractHowDoIQuery(rawQuery: string): { IsHowDoI: boolean; Needle: string } {
    const trimmed = rawQuery.trim();
    const isHowDoI = HOW_DO_I_PATTERN.test(trimmed);
    if (isHowDoI) {
        TourSignals.Instance.Emit('core.omnibar.howDoISearch', { query: trimmed });
    }
    const stripped = isHowDoI ? trimmed.replace(HOW_DO_I_PATTERN, '').trim() : trimmed;
    return { IsHowDoI: isHowDoI, Needle: stripped.toLowerCase() };
}

/**
 * '?' — Guided Tours & Learning Paths: searches eligible tours (including "how do I ..."
 * natural-language queries) and assigned learning paths, launching the chosen tour on
 * activation.
 */
@RegisterClass(OmnibarProvider, 'omnibar-tours')
export class OmnibarToursProvider extends OmnibarProvider {
    public readonly TriggerChar = '?';
    public readonly Key = 'omnibar-tours';
    public override readonly Priority = 20;
    public readonly ModeLabel = 'Tours & Help';
    public override readonly Placeholder = 'Search tours or ask "how do I..."…';

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const tourHost = this.context.TourHost;
        if (!tourHost) {
            return [];
        }

        const { Needle } = ExtractHowDoIQuery(request.Query);
        if (!Needle) {
            return this.EmptyStateSuggestions(request);
        }

        const [eligible, learningPaths] = await Promise.all([
            tourHost.GetEligibleTours(false).catch(() => []),
            tourHost.GetLearningPathSummaries().catch(() => []),
        ]);

        const suggestions: MentionSuggestion[] = [];
        const seenTourTargets = new Set<string>();

        const scoredTours = eligible
            .map(({ Tour }) => {
                const nameLower = Tour.Name.toLowerCase();
                const keyLower = Tour.TourKey.toLowerCase();
                const descLower = (Tour.Description ?? '').toLowerCase();
                const stepMatch = Tour.Steps.some(
                    (s) =>
                        s.Title.toLowerCase().includes(Needle) ||
                        (s.Body ?? '').toLowerCase().includes(Needle),
                );
                let score = 0;
                if (nameLower === Needle || keyLower === Needle) score = 1000;
                else if (nameLower.startsWith(Needle)) score = 500;
                else if (nameLower.includes(Needle) || keyLower.includes(Needle)) score = 200;
                else if (descLower.includes(Needle)) score = 100;
                else if (stepMatch) score = 50;
                return { Tour, score };
            })
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score);

        for (const { Tour } of scoredTours) {
            if (suggestions.length >= request.MaxResults) break;
            const nav: OmnibarNavPayload = { kind: 'tour', tourKey: Tour.TourKey };
            const minutes = Tour.EstimatedMinutes ? ` · ~${Tour.EstimatedMinutes} min` : '';
            seenTourTargets.add(`${Tour.TourKey}::`);
            suggestions.push({
                type: 'tour',
                id: `tour:${Tour.TourKey}`,
                name: Tour.Name,
                displayName: Tour.Name,
                description: `${Tour.Description || 'Guided tour'}${minutes}`,
                icon: 'fa-solid fa-route',
                data: { [OMNIBAR_NAV_KEY]: nav, group: 'Guided Tours' },
            });
        }

        if (OmnibarSemanticIndexService.Instance.IsReady && suggestions.length < request.MaxResults) {
            const semanticResult = await OmnibarSemanticIndexService.Instance.Query(Needle, {
                FilterKinds: ['tour'],
                MaxResults: request.MaxResults,
            }).catch(() => null);
            if (semanticResult) {
                for (const sem of semanticResult.Suggestions) {
                    if (suggestions.length >= request.MaxResults) break;
                    const nav = GetOmnibarNavPayload(sem);
                    if (!nav || nav.kind !== 'tour') {
                        continue;
                    }
                    const dedupeKey = `${nav.tourKey}::${nav.startAtStepKey ?? ''}`;
                    if (seenTourTargets.has(dedupeKey)) {
                        continue;
                    }
                    seenTourTargets.add(dedupeKey);
                    suggestions.push(sem);
                }
            }
        }

        for (const lp of learningPaths) {
            if (suggestions.length >= request.MaxResults) break;
            const matchesPath =
                lp.Path.Name.toLowerCase().includes(Needle) ||
                (lp.Path.Description ?? '').toLowerCase().includes(Needle);
            if (!matchesPath || !lp.NextTourKey) {
                continue;
            }
            const nav: OmnibarNavPayload = {
                kind: 'tour',
                tourKey: lp.NextTourKey,
                learningPathKey: lp.Path.PathKey,
            };
            suggestions.push({
                type: 'learning-path',
                id: `lp:${lp.Path.PathKey}`,
                name: lp.Path.Name,
                displayName: `${lp.Path.Name} (${lp.CompletedCount}/${lp.TotalCount})`,
                description: lp.NextTourName ? `Continue with: ${lp.NextTourName}` : 'Learning path',
                icon: 'fa-solid fa-graduation-cap',
                data: { [OMNIBAR_NAV_KEY]: nav, group: 'Learning Paths' },
            });
        }

        return suggestions.slice(0, request.MaxResults);
    }

    /** Empty '?' query: suggested tours for the current screen + active learning paths. */
    public override async EmptyStateSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const tourHost = this.context.TourHost;
        if (!tourHost) {
            return [];
        }

        const [suggested, learningPaths] = await Promise.all([
            tourHost.GetEligibleTours(true).catch(() => []),
            tourHost.GetLearningPathSummaries().catch(() => []),
        ]);

        const suggestions: MentionSuggestion[] = [];
        for (const { Tour } of suggested.slice(0, Math.max(1, request.MaxResults - 2))) {
            const nav: OmnibarNavPayload = { kind: 'tour', tourKey: Tour.TourKey };
            const minutes = Tour.EstimatedMinutes ? ` · ~${Tour.EstimatedMinutes} min` : '';
            suggestions.push({
                type: 'tour',
                id: `tour:${Tour.TourKey}`,
                name: Tour.Name,
                displayName: Tour.Name,
                description: `${Tour.Description || 'Suggested for this screen'}${minutes}`,
                icon: 'fa-solid fa-route',
                data: { [OMNIBAR_NAV_KEY]: nav, group: 'Suggested for this screen' },
            });
        }

        for (const lp of learningPaths) {
            if (suggestions.length >= request.MaxResults || !lp.NextTourKey) {
                break;
            }
            const nav: OmnibarNavPayload = {
                kind: 'tour',
                tourKey: lp.NextTourKey,
                learningPathKey: lp.Path.PathKey,
            };
            suggestions.push({
                type: 'learning-path',
                id: `lp:${lp.Path.PathKey}`,
                name: lp.Path.Name,
                displayName: `${lp.Path.Name} (${lp.CompletedCount}/${lp.TotalCount})`,
                description: lp.NextTourName ? `Next: ${lp.NextTourName}` : 'Learning path',
                icon: 'fa-solid fa-graduation-cap',
                data: { [OMNIBAR_NAV_KEY]: nav, group: 'Learning Paths' },
            });
        }

        return suggestions.slice(0, request.MaxResults);
    }
}

/** Tree-shaking guard — referenced by LoadOmnibarProviders(). */
export function LoadOmnibarToursProvider(): void {
    // intentional no-op
}
