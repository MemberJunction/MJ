import { describe, expect, it } from 'vitest';
import { ApplyClippedTitle, IsTextClipped } from '../clipped-title';

function fakeLabel(
    scrollWidth: number,
    clientWidth: number,
    scrollHeight = 20,
    clientHeight = 20,
): HTMLElement {
    return { scrollWidth, clientWidth, scrollHeight, clientHeight, title: '' } as HTMLElement;
}

describe('IsTextClipped', () => {
    it('is false when the text fits', () => {
        expect(IsTextClipped(fakeLabel(80, 80))).toBe(false);
        expect(IsTextClipped(fakeLabel(80, 100))).toBe(false);
        expect(IsTextClipped(null)).toBe(false);
    });

    it('is true when scrollWidth exceeds clientWidth by more than 1px', () => {
        expect(IsTextClipped(fakeLabel(140, 100))).toBe(true);
    });

    it('is true when vertical text overflows', () => {
        expect(IsTextClipped(fakeLabel(20, 20, 200, 80))).toBe(true);
    });
});

describe('ApplyClippedTitle', () => {
    it('sets title only when clipped', () => {
        const clipped = fakeLabel(140, 100);
        ApplyClippedTitle(clipped, 'Entitlement Grants');
        expect(clipped.title).toBe('Entitlement Grants');

        const fits = fakeLabel(80, 100);
        ApplyClippedTitle(fits, 'Details');
        expect(fits.title).toBe('');
    });
});
