/**
 * A field map's DestinationFieldName is the MJ column in both directions. Nothing validated it,
 * and `BaseEntity.Set` no-ops on an unknown field: the value is dropped for every record, the save
 * still succeeds, and the run reports the rows as written. These tests pin what counts as
 * unbindable — and, just as importantly, what does not, since a false positive here would put a
 * warning on every healthy run.
 */
import { describe, it, expect } from 'vitest';
import { FindUnbindableFieldMaps, DescribeUnbindableFieldMaps } from '../FieldMapValidation.js';

const map = (SourceFieldName: string, DestinationFieldName: string, extra: Record<string, unknown> = {}) =>
    ({ SourceFieldName, DestinationFieldName, Status: 'Active', ...extra });

const ENTITY_FIELDS = ['ID', 'FirstName', 'Email'];

describe('FindUnbindableFieldMaps', () => {
    it('finds a map whose destination column does not exist', () => {
        const found = FindUnbindableFieldMaps([map('email', 'Email'), map('middle', 'MiddleName')], ENTITY_FIELDS);
        expect(found).toEqual([{ SourceFieldName: 'middle', DestinationFieldName: 'MiddleName', IsKeyField: false }]);
    });

    it('binds case-insensitively, the way BaseEntity resolves field names', () => {
        expect(FindUnbindableFieldMaps([map('email', 'EMAIL')], ENTITY_FIELDS)).toEqual([]);
    });

    it('ignores maps that are not Active — they are never applied', () => {
        const found = FindUnbindableFieldMaps([map('middle', 'MiddleName', { Status: 'Inactive' })], ENTITY_FIELDS);
        expect(found).toEqual([]);
    });

    it('ignores a map with no destination at all — that is a different defect', () => {
        expect(FindUnbindableFieldMaps([map('middle', '')], ENTITY_FIELDS)).toEqual([]);
    });

    it('reports nothing when the entity could not be resolved, rather than flagging every map', () => {
        expect(FindUnbindableFieldMaps([map('email', 'Email'), map('middle', 'MiddleName')], [])).toEqual([]);
    });

    it('carries the key-field flag through, because an unbindable KEY re-creates every record', () => {
        const found = FindUnbindableFieldMaps([map('id', 'ExternalID', { IsKeyField: true })], ENTITY_FIELDS);
        expect(found[0].IsKeyField).toBe(true);
    });
});

describe('DescribeUnbindableFieldMaps', () => {
    it('names the pairs and what the operator should do', () => {
        const msg = DescribeUnbindableFieldMaps(
            [{ SourceFieldName: 'middle', DestinationFieldName: 'MiddleName', IsKeyField: false }],
            'contacts',
            'Contacts',
        );
        expect(msg).toContain("'contacts'");
        expect(msg).toContain("'Contacts'");
        expect(msg).toContain('middle -> MiddleName');
        expect(msg).toContain('silently dropped');
        expect(msg).not.toContain('KEY');
    });

    it('spells out the matching consequence when a KEY field cannot bind', () => {
        const msg = DescribeUnbindableFieldMaps(
            [{ SourceFieldName: 'id', DestinationFieldName: 'ExternalID', IsKeyField: true }],
            'contacts',
            'Contacts',
        );
        expect(msg).toContain('id -> ExternalID (KEY)');
        expect(msg).toContain('re-created');
    });
});
