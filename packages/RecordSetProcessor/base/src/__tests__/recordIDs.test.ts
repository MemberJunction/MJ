import { describe, it, expect } from 'vitest';
import { RecordIDs } from '../recordIDs';

describe('RecordIDs.Key', () => {
    it('matches a UUID whatever its case', () => {
        expect(RecordIDs.Key('5A5A0001-0000-4000-8000-000000000015')).toBe(RecordIDs.Key('5a5a0001-0000-4000-8000-000000000015'));
    });
    it('leaves any other ID as it is (a composite or case-sensitive key)', () => {
        expect(RecordIDs.Key('OrderID|AB||Line|3')).toBe('OrderID|AB||Line|3');
        expect(RecordIDs.Key('Abc')).not.toBe(RecordIDs.Key('abc'));
    });
});
