import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    MJAIConfidenceBadgeComponent,
    MJAIConfidenceSignalData,
    MJAIExplanationPanelComponent,
    MJAISourceRunEvent,
} from '../lib/ai-confidence/ai-confidence.component';

describe('MJAIConfidenceBadgeComponent', () => {
    let badge: MJAIConfidenceBadgeComponent;

    beforeEach(() => {
        badge = new MJAIConfidenceBadgeComponent();
    });

    it('defaults to unknown band with review-recommended guidance when Signal is null', () => {
        expect(badge.Band).toBe('unknown');
        expect(badge.IsUnknown).toBe(true);
        expect(badge.FormattedScore).toBeNull();
        expect(badge.DisplayLabel).toBe('Confidence unavailable — review recommended');
        expect(badge.IconClass).toBe('fa-solid fa-circle-question');
    });

    it('formats probability scores as percentages alongside plain-language band labels', () => {
        const signal: MJAIConfidenceSignalData = {
            scale: 'probability',
            confidence: 0.914,
            band: 'high',
            bandLabel: 'High confidence',
            recommendation: 'Merge',
            reasoning: 'Exact email and phone match.',
        };
        badge.Signal = signal;

        expect(badge.IsHigh).toBe(true);
        expect(badge.FormattedScore).toBe('91%');
        expect(badge.DisplayLabel).toBe('High confidence');
        expect(badge.AriaLabel).toBe('91% — High confidence');
        expect(badge.ShowGradeDots).toBe(false);
    });

    it('hides numeric percentage when ShowNumeric=false while keeping plain-language label', () => {
        badge.Signal = {
            scale: 'probability',
            confidence: 0.72,
            band: 'medium',
            bandLabel: 'Moderate confidence — review recommended',
            reasoning: 'Partial title overlap.',
        };
        badge.ShowNumeric = false;

        expect(badge.IsMedium).toBe(true);
        expect(badge.FormattedScore).toBeNull();
        expect(badge.AriaLabel).toBe('Moderate confidence — review recommended');
    });

    it('renders dot meter and never fabricates a percentage when scale="grade"', () => {
        badge.Signal = {
            scale: 'grade',
            confidence: null,
            band: 'high',
            bandLabel: 'Model reliability: Good',
            rawScale: 'Good',
            gradeDots: 4,
            reasoning: 'Validated on held-out cohort.',
        };

        expect(badge.FormattedScore).toBeNull();
        expect(badge.ShowGradeDots).toBe(true);
        expect(badge.FilledDotCount).toBe(4);
        expect(badge.DisplayLabel).toBe('Model reliability: Good');
    });
});

describe('MJAIExplanationPanelComponent', () => {
    let panel: MJAIExplanationPanelComponent;

    beforeEach(() => {
        panel = new MJAIExplanationPanelComponent();
    });

    it('toggles Expanded state and emits ExpandedChange on click and keyboard Enter/Space', () => {
        const emitted: boolean[] = [];
        panel.ExpandedChange.subscribe((val: boolean) => emitted.push(val));

        panel.Toggle();
        expect(panel.Expanded).toBe(true);

        const enterEvent = {
            key: 'Enter',
            preventDefault: vi.fn(),
        } as unknown as KeyboardEvent;
        panel.OnToggleKeydown(enterEvent);
        expect(enterEvent.preventDefault).toHaveBeenCalled();
        expect(panel.Expanded).toBe(false);
        expect(emitted).toEqual([true, false]);
    });

    it('detects provenance links and emits OpenSourceRun without coupling to Router', () => {
        panel.Signal = {
            scale: 'probability',
            confidence: 0.88,
            band: 'high',
            bandLabel: 'High confidence',
            reasoning: 'Matched primary identifier.',
            sourceAgentRunID: 'agent-run-uuid-1',
            sourcePromptRunID: 'prompt-run-uuid-2',
        };

        expect(panel.HasProvenance).toBe(true);

        const events: MJAISourceRunEvent[] = [];
        panel.OpenSourceRun.subscribe((ev: MJAISourceRunEvent) => events.push(ev));

        const clickEvent = { stopPropagation: vi.fn() } as unknown as Event;
        panel.EmitSourceRun('agentRun', panel.Signal.sourceAgentRunID, clickEvent);
        panel.EmitSourceRun('promptRun', panel.Signal.sourcePromptRunID, clickEvent);

        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(2);
        expect(events).toEqual([
            { runType: 'agentRun', runID: 'agent-run-uuid-1' },
            { runType: 'promptRun', runID: 'prompt-run-uuid-2' },
        ]);
    });
});
