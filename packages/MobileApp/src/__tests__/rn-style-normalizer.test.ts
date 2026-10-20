import { describe, expect, it } from 'vitest';
import { NormalizeWebStyle } from '@/interactive/rn-style-normalizer';

/**
 * Converting an agent-authored web style into one React Native can use.
 *
 * The percentage cases exist because of a real defect: `%` was grouped with `vh`/`vw` as a unit RN
 * "cannot resolve" and dropped wholesale. RN resolves percentages natively on dimensions, position
 * and spacing — so a component that drew a bar chart with `width: '38%'` rendered six identical
 * full-width bars, every one reading 100%. A wrong answer displayed confidently is worse than a
 * missing chart, which is why these are pinned.
 */
describe('NormalizeWebStyle', () => {
    it('keeps percentages on properties React Native resolves them for', () => {
        expect(NormalizeWebStyle({ width: '38%' })).toEqual({ width: '38%' });
        expect(NormalizeWebStyle({ height: '50%' })).toEqual({ height: '50%' });
        expect(NormalizeWebStyle({ maxWidth: '100%' })).toEqual({ maxWidth: '100%' });
        expect(NormalizeWebStyle({ marginLeft: '12.5%' })).toEqual({ marginLeft: '12.5%' });
        expect(NormalizeWebStyle({ flexBasis: '25%' })).toEqual({ flexBasis: '25%' });
        expect(NormalizeWebStyle({ top: '10%' })).toEqual({ top: '10%' });
    });

    it('drops percentages where React Native would ignore them anyway', () => {
        // Reporting it beats passing through a value that is silently discarded one layer down.
        expect(NormalizeWebStyle({ borderRadius: '50%' })).toEqual({});
        expect(NormalizeWebStyle({ fontSize: '120%' })).toEqual({});
    });

    it('still drops viewport units, which RN genuinely cannot resolve', () => {
        expect(NormalizeWebStyle({ width: '100vw' })).toEqual({});
        expect(NormalizeWebStyle({ height: '50vh' })).toEqual({});
        expect(NormalizeWebStyle({ minHeight: '10vmin' })).toEqual({});
    });

    it('converts pixel lengths to numbers', () => {
        expect(NormalizeWebStyle({ padding: '16px' })).toEqual({ padding: 16 });
        expect(NormalizeWebStyle({ marginTop: '-1.5px' })).toEqual({ marginTop: -1.5 });
    });

    it('passes numbers and colours through untouched', () => {
        expect(NormalizeWebStyle({ width: 120, backgroundColor: '#0076b6', fontWeight: '700' }))
            .toEqual({ width: 120, backgroundColor: '#0076b6', fontWeight: '700' });
    });

    it('strips web-only declarations', () => {
        expect(NormalizeWebStyle({ className: 'x', display: 'contents' })).toEqual({});
        expect(NormalizeWebStyle({ position: 'fixed' })).toEqual({});
    });

    it('handles a whole bar-chart style bag the way the component authored it', () => {
        // The exact shape the seeded catalog component emits for one bar.
        expect(NormalizeWebStyle({ height: 10, width: '21%', backgroundColor: '#0076b6', borderRadius: 5 }))
            .toEqual({ height: 10, width: '21%', backgroundColor: '#0076b6', borderRadius: 5 });
    });
});
