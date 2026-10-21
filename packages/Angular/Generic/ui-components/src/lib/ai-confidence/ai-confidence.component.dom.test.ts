import { describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    MJAIConfidenceBadgeComponent,
    MJAIConfidenceSignalData,
    MJAIExplanationPanelComponent,
    MJAISourceRunEvent,
} from './ai-confidence.component';

describe('MJAIConfidenceBadgeComponent & MJAIExplanationPanelComponent (DOM)', () => {
    function renderBadge(
        setup?: (c: MJAIConfidenceBadgeComponent) => void
    ): ComponentFixture<MJAIConfidenceBadgeComponent> {
        const fixture = TestBed.createComponent(MJAIConfidenceBadgeComponent);
        setup?.(fixture.componentInstance);
        fixture.detectChanges();
        return fixture;
    }

    function renderPanel(
        setup?: (c: MJAIExplanationPanelComponent) => void
    ): ComponentFixture<MJAIExplanationPanelComponent> {
        const fixture = TestBed.createComponent(MJAIExplanationPanelComponent);
        setup?.(fixture.componentInstance);
        fixture.detectChanges();
        return fixture;
    }

    it('renders probability score percentage, plain-language band label, and host band class', () => {
        const host = renderBadge((c) => {
            c.Signal = {
                scale: 'probability',
                confidence: 0.92,
                band: 'high',
                bandLabel: 'High confidence',
                reasoning: 'Exact match.',
            };
        }).nativeElement as HTMLElement;

        expect(host.classList.contains('mj-ai-confidence-badge--high')).toBe(true);
        expect(host.getAttribute('role')).toBe('status');
        expect(host.getAttribute('aria-label')).toBe('92% — High confidence');
        expect(host.querySelector('.mj-ai-confidence-badge-score')?.textContent?.trim()).toBe('92%');
        expect(host.querySelector('.mj-ai-confidence-badge-label')?.textContent?.trim()).toBe('High confidence');
    });

    it('renders 5-dot grade meter without a fabricated percentage when scale="grade"', () => {
        const host = renderBadge((c) => {
            c.Signal = {
                scale: 'grade',
                confidence: null,
                band: 'high',
                bandLabel: 'Model reliability: Good',
                rawScale: 'Good',
                gradeDots: 4,
                reasoning: 'Validated on held-out cohort.',
            };
        }).nativeElement as HTMLElement;

        expect(host.querySelector('.mj-ai-confidence-badge-score')).toBeNull();
        const dots = host.querySelectorAll('.mj-ai-confidence-badge-dot');
        const filled = host.querySelectorAll('.mj-ai-confidence-badge-dot--filled');
        expect(dots.length).toBe(5);
        expect(filled.length).toBe(4);
        expect(host.querySelector('.mj-ai-confidence-badge-label')?.textContent?.trim()).toBe(
            'Model reliability: Good'
        );
    });

    it('expands MJAIExplanationPanelComponent body on header click and emits OpenSourceRun on trace button click', () => {
        const signal: MJAIConfidenceSignalData = {
            scale: 'probability',
            confidence: 0.45,
            band: 'low',
            bandLabel: 'Low confidence — manual check required',
            recommendation: 'Uncertain',
            headline: 'Conflicting company domains.',
            reasoning: 'First record uses acme.io while second uses acme-corp.org.',
            canAct: false,
            gateReason: 'Manual steward confirmation is required before merging.',
            sourceAgentRunID: 'agent-run-99',
            sourcePromptRunID: 'prompt-run-42',
        };

        const fixture = renderPanel((c) => {
            c.Signal = signal;
            c.Expanded = false;
        });
        const host = fixture.nativeElement as HTMLElement;

        // Initially collapsed
        const header = host.querySelector('.mj-ai-explanation-header') as HTMLElement;
        expect(header.getAttribute('aria-expanded')).toBe('false');
        expect(host.querySelector('.mj-ai-explanation-body')).toBeNull();

        // Click header to expand
        header.click();
        fixture.detectChanges();

        expect(header.getAttribute('aria-expanded')).toBe('true');
        const body = host.querySelector('.mj-ai-explanation-body');
        expect(body).not.toBeNull();
        expect(host.querySelector('.mj-ai-explanation-headline')?.textContent?.trim()).toBe(
            'Conflicting company domains.'
        );
        expect(host.querySelector('.mj-ai-explanation-gate-banner')?.textContent).toContain(
            'Manual steward confirmation is required'
        );

        // Click provenance trace buttons
        const emitted: MJAISourceRunEvent[] = [];
        fixture.componentInstance.OpenSourceRun.subscribe((ev: MJAISourceRunEvent) => emitted.push(ev));

        const traceButtons = host.querySelectorAll('.mj-ai-explanation-trace-link');
        expect(traceButtons.length).toBe(2);
        (traceButtons[0] as HTMLButtonElement).click();
        (traceButtons[1] as HTMLButtonElement).click();

        expect(emitted).toEqual([
            { runType: 'agentRun', runID: 'agent-run-99' },
            { runType: 'promptRun', runID: 'prompt-run-42' },
        ]);
    });
});
