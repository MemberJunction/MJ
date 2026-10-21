import { describe, it, expect } from 'vitest';
import { ChartInteraction } from '../interaction';

const p1 = { CategoryIndex: 0, SeriesIndex: 0 };
const p2 = { CategoryIndex: 1, SeriesIndex: 0 };

describe('ChartInteraction', () => {
    it('mouse: hover opens the tooltip, click emits, pointerup does nothing', () => {
        const i = new ChartInteraction();
        i.Hover(p1);
        expect(i.Active).toEqual(p1);
        expect(i.TooltipOpen).toBe(true);
        expect(i.PointerUp(p1, 'mouse')).toBe('none');
        expect(i.Click(p1)).toBe('emit');
    });

    it('touch: first tap arms and shows, second tap on the same point emits, synthetic clicks never emit', () => {
        const i = new ChartInteraction();
        expect(i.PointerUp(p1, 'touch')).toBe('arm');
        expect(i.TooltipOpen).toBe(true);
        expect(i.Click(p1)).toBe('none');
        expect(i.PointerUp(p1, 'touch')).toBe('emit');
        expect(i.Click(p1)).toBe('none');
    });

    it('touch: tapping a different point re-arms instead of emitting', () => {
        const i = new ChartInteraction();
        i.PointerUp(p1, 'touch');
        expect(i.PointerUp(p2, 'touch')).toBe('arm');
        expect(i.Active).toEqual(p2);
    });

    it('keyboard navigation marks keyboard activity; hover clears it', () => {
        const i = new ChartInteraction();
        i.Navigate(p1);
        expect(i.KeyboardActive).toBe(true);
        i.Hover(p2);
        expect(i.KeyboardActive).toBe(false);
    });

    it('touch: tapping empty space dismisses the armed point', () => {
        const i = new ChartInteraction();
        i.PointerUp(p1, 'touch');
        expect(i.PointerUp(null, 'touch')).toBe('none');
        expect(i.Active).toBeNull();
        expect(i.TooltipOpen).toBe(false);
    });

    it('touch: tapping empty space leaves a keyboard selection alone', () => {
        const i = new ChartInteraction();
        i.Navigate(p1);
        i.PointerUp(null, 'touch');
        expect(i.Active).toEqual(p1);
    });

    it('Leave is a no-op while keyboard navigation is active', () => {
        const i = new ChartInteraction();
        i.Navigate(p1);
        i.Leave();
        expect(i.Active).toEqual(p1);
        expect(i.KeyboardActive).toBe(true);
    });

    it('Dismiss closes the tooltip but keeps the point; Blur and Leave clear it', () => {
        const i = new ChartInteraction();
        i.Navigate(p1);
        i.Dismiss();
        expect(i.TooltipOpen).toBe(false);
        expect(i.Active).toEqual(p1);
        i.Blur();
        expect(i.Active).toBeNull();
        i.Hover(p1);
        i.Leave();
        expect(i.Active).toBeNull();
    });
});
