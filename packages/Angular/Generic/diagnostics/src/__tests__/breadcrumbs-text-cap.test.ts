import { describe, it, expect } from 'vitest';
import { DescribeClickTarget } from '../lib/breadcrumbs';

function element(tagName: string, attributes: Record<string, string>, text: string): Element {
    const el = {
        tagName,
        id: attributes['id'] ?? '',
        textContent: text,
        getAttribute: (name: string) => attributes[name] ?? null,
        closest: () => el,
    };
    return el as unknown as Element;
}

describe('DescribeClickTarget with long leading white space', () => {
    it('leaves out an identifier equal to a label that follows 200+ white-space characters', () => {
        const text = '\n' + ' '.repeat(210) + 'Save';

        expect(DescribeClickTarget(element('BUTTON', { id: 'Save' }, text))).toBe('button');
        expect(DescribeClickTarget(element('BUTTON', { 'data-testid': 'save-button' }, text))).toBe('button');
    });
});
