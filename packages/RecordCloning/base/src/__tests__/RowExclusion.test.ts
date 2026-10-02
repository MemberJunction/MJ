import { describe, it, expect } from 'vitest';
import { RowMatchesExclusion } from '../RowExclusion';

describe('RowMatchesExclusion', () => {
    const rules = [{ Field: 'Setting', StartsWith: ['mobile.'], Equals: ['mj.chat.drafts.v1'] }];

    it('matches by prefix or exact value', () => {
        expect(RowMatchesExclusion({ Setting: 'mobile.pushDeviceToken' }, rules)).toBe(true);
        expect(RowMatchesExclusion({ Setting: 'mj.chat.drafts.v1' }, rules)).toBe(true);
    });

    it('leaves other rows, empty values and rule-less relationships alone', () => {
        expect(RowMatchesExclusion({ Setting: 'theme' }, rules)).toBe(false);
        expect(RowMatchesExclusion({ Setting: null }, rules)).toBe(false);
        expect(RowMatchesExclusion({ Setting: 'mobile.x' }, undefined)).toBe(false);
    });

    it('is case-sensitive, like the keys it matches', () => {
        expect(RowMatchesExclusion({ Setting: 'Mobile.pushDeviceToken' }, rules)).toBe(false);
    });
});
