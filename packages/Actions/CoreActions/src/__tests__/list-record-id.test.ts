/**
 * #4221: ListDetail.RecordID holds the compact CompositeKey segment. The list actions refuse a
 * caller id that cannot name a record of the list's entity.
 */
import { describe, it, expect } from 'vitest';
import { ListRecordIDError } from '../custom/lists/_action-helpers';

describe('ListRecordIDError', () => {
    it('keeps a bare value for a single-column key', () => {
        expect(ListRecordIDError(1, 'ABC-123')).toBeNull();
    });

    it('keeps a compact segment for a composite key', () => {
        expect(ListRecordIDError(2, 'OrderID|1||LineNumber|2')).toBeNull();
    });

    it('refuses a bare value for a composite key and says what to pass', () => {
        const error = ListRecordIDError(2, '42');
        expect(error).toContain('2-field primary key');
        expect(error).toContain('Field1|value1||Field2|value2');
    });

    it('refuses an empty id', () => {
        expect(ListRecordIDError(1, '  ')).toBe('Record ID is empty');
    });
});
