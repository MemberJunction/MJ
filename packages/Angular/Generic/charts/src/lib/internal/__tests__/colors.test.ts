import { describe, it, expect } from 'vitest';
import { DefaultVizColor, ResolveColor } from '../colors';

describe('DefaultVizColor', () => {
    it('cycles through the 10 categorical viz tokens by index', () => {
        expect(DefaultVizColor(0)).toBe('var(--mj-viz-1)');
        expect(DefaultVizColor(9)).toBe('var(--mj-viz-10)');
        expect(DefaultVizColor(10)).toBe('var(--mj-viz-1)');
    });
});

describe('ResolveColor', () => {
    it('uses the default viz token when no color is given', () => {
        expect(ResolveColor(undefined, 2)).toEqual({ Fill: 'var(--mj-viz-3)', Rejected: null });
    });

    it('treats null (from JSON or untyped data) like undefined without throwing', () => {
        const fromJson: { Color: string | null } = JSON.parse('{"Color":null}');
        expect(() => ResolveColor(fromJson.Color, 4)).not.toThrow();
        expect(ResolveColor(fromJson.Color, 4)).toEqual({ Fill: 'var(--mj-viz-5)', Rejected: null });
    });

    it('rejects a non-string Color from untyped JSON instead of throwing, and reports it as a string', () => {
        const fromJson: { Color: string } = JSON.parse('{"Color":123}');
        expect(() => ResolveColor(fromJson.Color, 0)).not.toThrow();
        expect(ResolveColor(fromJson.Color, 0)).toEqual({ Fill: 'var(--mj-viz-1)', Rejected: '123' });
        const object: { Color: string } = JSON.parse('{"Color":{"a":1}}');
        expect(ResolveColor(object.Color, 1)).toEqual({ Fill: 'var(--mj-viz-2)', Rejected: '[object Object]' });
    });

    it('accepts a var(--token) reference, trimmed', () => {
        expect(ResolveColor('  var(--mj-status-success) ', 0)).toEqual({ Fill: 'var(--mj-status-success)', Rejected: null });
    });

    it.each(['#16a34a', 'red', '--mj-status-success', 'var(--mj-x', 'var(--mj-x) !important', ''])(
        'rejects %j and falls back to the index default',
        (bad) => {
            expect(ResolveColor(bad, 1)).toEqual({ Fill: 'var(--mj-viz-2)', Rejected: bad });
        },
    );
});
