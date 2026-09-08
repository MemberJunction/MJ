import { describe, expect, it } from 'vitest';
import { AsPaneSizePair, ReadPaneSizePair, ToPaneSizePair } from './pane-split';

describe('AsPaneSizePair', () => {
    it('accepts a usable pair and rejects a hidden pane', () => {
        expect(AsPaneSizePair([22, 78])).toEqual([22, 78]);
        expect(AsPaneSizePair([0, 100])).toBeNull();
        expect(AsPaneSizePair('nope')).toBeNull();
    });
});

describe('ReadPaneSizePair', () => {
    it('reads a usable pair', () => {
        expect(ReadPaneSizePair(JSON.stringify([70, 30]))).toEqual([70, 30]);
    });

    it('rejects a pair that would hide a pane', () => {
        expect(ReadPaneSizePair(JSON.stringify([0, 100]))).toBeNull();
        expect(ReadPaneSizePair(JSON.stringify([3, 97]))).toBeNull();
    });

    it('rejects unusable values', () => {
        for (const bad of [undefined, 'not json', '{}', '[50]', '[null,null]', '["a","b"]']) {
            expect(ReadPaneSizePair(bad)).toBeNull();
        }
    });
});

describe('ToPaneSizePair', () => {
    it('keeps two numeric sizes', () => {
        expect(ToPaneSizePair([72, 28])).toEqual([72, 28]);
    });

    it('drops an auto-sized area so it cannot be stored', () => {
        expect(ToPaneSizePair([50, '*'])).toBeNull();
    });
});
