import { describe, it, expect } from 'vitest';
import {
    serializeInteractiveElements,
    formatDiagnosticsDigest,
    summarizeOlderSteps,
    DEFAULT_MAX_VERBATIM_STEPS,
} from '../engine/perception.js';
import { InteractiveElement, BrowserDiagnosticEvent } from '../types/browser.js';
import { StepRecord } from '../types/judge.js';
import { ComputerUseError } from '../types/errors.js';

// ─── from element-serializer ───

function el(overrides: Partial<InteractiveElement> = {}): InteractiveElement {
    return Object.assign(new InteractiveElement(), overrides);
}

describe('serializeInteractiveElements', () => {
    it('renders indexed role + quoted name lines', () => {
        const out = serializeInteractiveElements([
            el({ Index: 12, Role: 'button', Name: 'Save Record', Selector: '#save' }),
            el({ Index: 13, Role: 'link', Name: 'New', Selector: 'a.new' }),
        ]);
        expect(out).toContain('[12] button "Save Record"');
        expect(out).toContain('[13] link "New"');
    });

    it('marks inputs with value or (empty)', () => {
        const out = serializeInteractiveElements([
            el({ Index: 1, Role: 'textbox', Name: 'Name', Value: '', Selector: '#n' }),
            el({ Index: 2, Role: 'textbox', Name: 'Email', Value: 'a@b.com', Selector: '#e' }),
        ]);
        expect(out).toContain('[1] textbox "Name" (empty)');
        expect(out).toContain('[2] textbox "Email" = "a@b.com"');
    });

    it('adds |SCROLL| and (disabled) markers', () => {
        const out = serializeInteractiveElements([
            el({ Index: 3, Role: 'region', Name: 'Results', Scrollable: true, Selector: '#grid' }),
            el({ Index: 4, Role: 'button', Name: 'Delete', Disabled: true, Selector: '#del' }),
        ]);
        expect(out).toContain('[3] |SCROLL| region "Results"');
        expect(out).toContain('[4] button "Delete" (disabled)');
    });

    it('marks elements new since the previous step with *', () => {
        const prev = [el({ Index: 1, Role: 'button', Name: 'Save', Selector: '#save' })];
        const curr = [
            el({ Index: 1, Role: 'button', Name: 'Save', Selector: '#save' }),
            el({ Index: 2, Role: 'button', Name: 'Publish', Selector: '#pub' }),
        ];
        const out = serializeInteractiveElements(curr, prev);
        expect(out).toContain('[1] button "Save"');
        expect(out).not.toContain('[1]* ');
        expect(out).toContain('[2]* button "Publish"');
    });

    it('does not mark anything new on the first step (no prev list)', () => {
        const out = serializeInteractiveElements([el({ Index: 1, Role: 'button', Name: 'Go', Selector: '#g' })]);
        expect(out).not.toContain('*');
    });

    it('handles an empty element set', () => {
        expect(serializeInteractiveElements([])).toBe('(no interactive elements detected)');
    });

    it('truncates at the char budget and reports how many were dropped', () => {
        const many = Array.from({ length: 100 }, (_, i) =>
            el({ Index: i, Role: 'button', Name: `Button number ${i}`, Selector: `#b${i}` }));
        const out = serializeInteractiveElements(many, undefined, 200);
        expect(out).toMatch(/more element\(s\) omitted/);
        expect(out.length).toBeLessThan(400);
    });

    it('keeps at least one line even when it alone exceeds the budget', () => {
        const out = serializeInteractiveElements(
            [el({ Index: 1, Role: 'button', Name: 'X'.repeat(500), Selector: '#x' })],
            undefined,
            50
        );
        expect(out).toContain('[1] button');
    });
});

// ─── from digests ───

function ev(partial: Partial<BrowserDiagnosticEvent>): BrowserDiagnosticEvent {
    return { timestamp: '2026-01-01T00:00:00Z', type: 'console', message: 'm', ...partial };
}

describe('formatDiagnosticsDigest', () => {
    it('returns empty for no events', () => {
        expect(formatDiagnosticsDigest([])).toBe('');
    });

    it('drops console warnings (noise) but keeps console errors', () => {
        const out = formatDiagnosticsDigest([
            ev({ type: 'console', level: 'warning', message: 'deprecation notice' }),
            ev({ type: 'console', level: 'error', message: 'ChunkLoadError' }),
        ]);
        expect(out).toBe('console.error: ChunkLoadError');
    });

    it('keeps page errors, failed requests, and crashes regardless of level', () => {
        const out = formatDiagnosticsDigest([
            ev({ type: 'pageerror', message: 'TypeError: x is undefined' }),
            ev({ type: 'requestfailed', message: 'POST /graphql net::ERR_ABORTED' }),
            ev({ type: 'crash', message: 'Page crashed' }),
        ]);
        expect(out).toContain('pageerror: TypeError: x is undefined');
        expect(out).toContain('requestfailed: POST /graphql net::ERR_ABORTED');
        expect(out).toContain('crash: Page crashed');
    });

    it('returns empty when only noise (warnings) is present', () => {
        expect(formatDiagnosticsDigest([ev({ type: 'console', level: 'warning', message: 'w' })])).toBe('');
    });

    it('caps the digest and appends an ellipsis when truncated', () => {
        const many = Array.from({ length: 50 }, (_, i) => ev({ type: 'pageerror', message: `error number ${i} with some length` }));
        const out = formatDiagnosticsDigest(many, 200);
        expect(out.length).toBeLessThanOrEqual(200 + 2); // + the trailing "…" line
        expect(out.endsWith('…')).toBe(true);
    });

    it('preserves capture order (oldest first)', () => {
        const out = formatDiagnosticsDigest([
            ev({ type: 'pageerror', message: 'first' }),
            ev({ type: 'pageerror', message: 'second' }),
        ]);
        expect(out).toBe('pageerror: first\npageerror: second');
    });
});


function step(n: number, urlAfter: string, error = false): StepRecord {
    const s = new StepRecord();
    s.StepNumber = n;
    s.UrlAfter = urlAfter;
    if (error) s.Error = new ComputerUseError('LLMError', 'boom');
    return s;
}

describe('summarizeOlderSteps', () => {
    it('returns empty for no steps', () => {
        expect(summarizeOlderSteps([])).toBe('');
    });

    it('reports the step range and per-path visit counts', () => {
        const out = summarizeOlderSteps([
            step(1, 'http://x/app/a'),
            step(2, 'http://x/app/b'),
            step(3, 'http://x/app/a'),
            step(4, 'http://x/app/a'),
        ]);
        expect(out).toContain('Steps 1–4 (summarized)');
        expect(out).toContain('/app/a (×3)'); // repeat count preserved (loop signal)
        expect(out).toContain('/app/b');
    });

    it('counts errors', () => {
        const out = summarizeOlderSteps([step(1, 'http://x/a', true), step(2, 'http://x/a', true)]);
        expect(out).toContain('2 error(s)');
    });

    it('handles steps with no navigation', () => {
        expect(summarizeOlderSteps([step(1, '')])).toContain('no navigation');
    });

    it('exposes a sane verbatim window default', () => {
        expect(DEFAULT_MAX_VERBATIM_STEPS).toBe(8);
    });
});
