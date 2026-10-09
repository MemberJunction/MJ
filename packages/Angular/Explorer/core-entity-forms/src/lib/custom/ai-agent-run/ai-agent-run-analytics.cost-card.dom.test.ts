import { describe, it, expect } from 'vitest';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { AIAgentRunAnalyticsComponent } from './ai-agent-run-analytics.component';
import { AIAgentRunCostService } from './ai-agent-run-cost.service';

/**
 * DOM coverage for the Total Cost card's split on an avatar call: the output figure prices only the output tokens the
 * cost row's line priced, and the avatar video shows on a line of its own, from the run's cost lines. The prompt runs
 * and the token rates are set directly (placeholder data), so no data loads and no charts render; child components are
 * not declared (NO_ERRORS_SCHEMA), only the card's own markup is under test.
 */

/** The private members the test sets instead of loading data. */
interface AnalyticsInternals {
    cacheRates: Map<string, { InputRate: number; OutputRate: number; CacheReadRate: number; CacheWriteRate: number }>;
    rateKey(modelID: string, vendorID: string): string;
    calculatePromptMetrics(): void;
}

/** One speaking minute at $0.75 / $4.50 per 1M tokens: 371,520 of its output tokens are video, priced at $0.37152. */
function promptRun(withVideoLine: boolean): MJAIPromptRunEntity {
    const lines = [{ Modality: null, CostRowID: 'row', Measure: 'Tokens', Input: 10000, Output: withVideoLine ? 2000 : 373520, Cost: 0.0165 }];
    if (withVideoLine) {
        lines.push({ Modality: 'Video', CostRowID: null, Measure: 'Seconds', Input: 0, Output: 60, Cost: 0.37152 } as unknown as (typeof lines)[number]);
    }
    return {
        ID: 'prompt-run-1',
        Model: 'Placeholder Live Model',
        Vendor: 'Placeholder Vendor',
        ModelID: 'model-1',
        VendorID: 'vendor-1',
        RunAt: new Date('2026-10-08T12:00:00Z'),
        CompletedAt: new Date('2026-10-08T12:01:00Z'),
        Success: true,
        TokensPrompt: 10000,
        TokensCompletion: 373520,
        TotalCost: withVideoLine ? 0.38802 : 1.68834,
        ModelSpecificResponseDetails: JSON.stringify({ CostLines: lines }),
    } as unknown as MJAIPromptRunEntity;
}

function renderCard(run: MJAIPromptRunEntity): ComponentFixture<AIAgentRunAnalyticsComponent> {
    TestBed.configureTestingModule({
        declarations: [AIAgentRunAnalyticsComponent],
        providers: [{ provide: AIAgentRunCostService, useValue: {} }],
        schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(AIAgentRunAnalyticsComponent);
    const component = fixture.componentInstance;
    const internals = component as unknown as AnalyticsInternals;
    component.isLoading = false;
    component.AllPromptRuns = [run];
    internals.cacheRates.set(internals.rateKey('model-1', 'vendor-1'), { InputRate: 0.75e-6, OutputRate: 4.5e-6, CacheReadRate: 0.75e-6, CacheWriteRate: 0.75e-6 });
    internals.calculatePromptMetrics();
    fixture.detectChanges();
    return fixture;
}

function costCardLines(fixture: ComponentFixture<AIAgentRunAnalyticsComponent>): string[] {
    const card = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.summary-card')).find((c) => c.querySelector('.card-icon.cost'));
    return Array.from(card?.querySelectorAll('.metric-detail span') ?? []).map((span) => (span.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('AIAgentRunAnalyticsComponent cost card (DOM)', () => {
    it('shows the avatar video on its own line, and output only for the tokens the cost row priced', () => {
        const lines = costCardLines(renderCard(promptRun(true)));

        expect(lines).toContain('input $0.0075 · output $0.0090');
        expect(lines).toContain('avatar video $0.372');
    });

    it('shows no avatar video line for a run without one, and its output as before', () => {
        const fixture = renderCard(promptRun(false));
        const lines = costCardLines(fixture);

        expect(lines).toContain('input $0.0075 · output $1.68');
        expect((fixture.nativeElement as HTMLElement).querySelector('.avatar-video-cost')).toBeNull();
    });
});
