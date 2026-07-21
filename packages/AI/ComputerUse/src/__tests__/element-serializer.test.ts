import { describe, it, expect } from 'vitest';
import { serializeInteractiveElements } from '../engine/element-serializer.js';
import { InteractiveElement } from '../types/browser.js';

function el(overrides: Partial<InteractiveElement> = {}): InteractiveElement {
    return Object.assign(new InteractiveElement(), overrides);
}

describe('serializeInteractiveElements (CU-A4)', () => {
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
