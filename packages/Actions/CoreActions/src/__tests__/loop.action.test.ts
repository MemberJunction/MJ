import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: { Instance: { RunAction: vi.fn() } },
}));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/actions-base', () => ({}));

import { ReplaceTemplatePlaceholders } from '../custom/workflow/loop.action';

const values: Record<string, string> = { item: 'X', 'user.name': 'Ann' };
const resolve = (path: string): string | undefined => values[path.trim()];

describe('ReplaceTemplatePlaceholders', () => {
    it.each([
        ['Hi {{user.name}}', 'Hi Ann'],
        ['{{ item }}-{{item}}', 'X-X'],
        ['{{missing}} stays', '{{missing}} stays'],
        ['{{}} and {{item', '{{}} and {{item'],
        ['{{{item}}', '{{{item}}'],
        ['{{item}}}', 'X}'],
        ['{{a}b}} {{item}}', '{{a}b}} X'],
        ['plain', 'plain'],
    ])('replaces %j', (template, expected) => {
        expect(ReplaceTemplatePlaceholders(template, resolve)).toBe(expected);
    });

    it('reads 100k characters of unclosed braces in linear time', () => {
        const started = Date.now();
        expect(ReplaceTemplatePlaceholders('{{'.repeat(50_000), resolve)).toBe('{{'.repeat(50_000));
        expect(ReplaceTemplatePlaceholders('{{{{|'.repeat(20_000), resolve)).toBe('{{{{|'.repeat(20_000));
        expect(Date.now() - started).toBeLessThan(2500);
    });
});
