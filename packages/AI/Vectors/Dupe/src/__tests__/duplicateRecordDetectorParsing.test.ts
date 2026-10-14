/**
 * The detector's pure steps on real MJ objects: parsing vector matches into candidates (dropping the source record
 * itself), filtering self-matches, and building the source metadata the run details carry. Real `CompositeKey`,
 * `PotentialDuplicate`, `EntityInfo` and entity records, so a change in their behaviour shows up here.
 */
import { describe, it, expect } from 'vitest';
import { BaseEntity, CompositeKey, EntityInfo, PotentialDuplicate } from '@memberjunction/core';
import type { BaseResponse } from '@memberjunction/ai-vectordb';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

/** A field of a test entity: its name, plus the flags the metadata map reads. */
interface FieldSeed {
    Name: string;
    IsNameField?: boolean;
    DefaultInView?: boolean;
}

/** Entity metadata keyed by ID, with the given fields in sequence order. */
function entityInfo(name: string, icon: string | null, fields: FieldSeed[]): EntityInfo {
    const entityID = `entity-${name}`;
    return new EntityInfo({
        ID: entityID, Name: name, Icon: icon,
        Fields: [{ Name: 'ID', IsPrimaryKey: true }, ...fields].map((field, index) => ({
            ID: `${entityID}-${field.Name}`, EntityID: entityID, Entity: name, Sequence: index + 1, Type: 'nvarchar',
            IsPrimaryKey: false, IsNameField: false, DefaultInView: false, ...field,
        })),
    });
}

/** A record of a test entity. */
class TestRecord extends BaseEntity {}

/** A record of the entity holding the given values. */
function record(info: EntityInfo, values: Record<string, unknown>): BaseEntity {
    const entity = new TestRecord(info);
    entity.Hydrate(values);
    return entity;
}

/** A vector match candidate with the given key and score. */
function candidate(id: string, score: number): PotentialDuplicate {
    const duplicate = new PotentialDuplicate();
    duplicate.KeyValuePairs = [{ FieldName: 'ID', Value: id }];
    duplicate.ProbabilityScore = score;
    return duplicate;
}

/** A vector query response holding the given matches. */
function response(matches: { id: string; score: number; metadata: Record<string, string> }[]): BaseResponse {
    return { success: true, message: 'ok', data: { matches } };
}

/** The detector, exposing its protected steps. */
class TestableDetector extends DuplicateRecordDetector {
    public FilterSelf(duplicates: PotentialDuplicate[], sourceKey: CompositeKey): PotentialDuplicate[] {
        return this.FilterSelfMatches(duplicates, sourceKey);
    }
    public MetadataMap(records: BaseEntity[], info: EntityInfo): Map<string, string> {
        return this.buildSourceMetadataMap(records, info);
    }
}

const detector = new TestableDetector(new EntitiesOnlyProvider([]));

/** The metadata stored for a record id, parsed. */
function metadataOf(map: Map<string, string>, id: string): Record<string, string> {
    return JSON.parse(map.get(id) ?? '{}');
}

describe('DuplicateRecordDetector.ParseVectorMatches', () => {
    // Every record is its own nearest neighbor (cosine ~1.0), so the source record itself comes back as the top vector
    // match. It must be dropped at parse time. The in-process SVS provider returns BARE primary-key values as
    // metadata.RecordID, the shape that previously slipped past the Equals-based filter.
    it('should drop the source record itself (bare-PK self-match) at parse time', () => {
        const result = detector.ParseVectorMatches(response([
            { id: 'm1', score: 1.0, metadata: { RecordID: 'rec-1', Entity: 'Contacts', TemplateID: 't-1' } },
            { id: 'm2', score: 0.85, metadata: { RecordID: 'rec-2', Entity: 'Contacts', TemplateID: 't-1' } },
        ]), CompositeKey.FromKeyValuePair('ID', 'rec-1'));

        expect(result.Duplicates).toHaveLength(1);
        expect(result.Duplicates[0].KeyValuePairs[0].Value).toBe('rec-2');
    });

    it('should drop the self-match even when the source RecordID differs only in UUID casing', () => {
        const result = detector.ParseVectorMatches(response([
            { id: 'm1', score: 1.0, metadata: { RecordID: 'abc-123', Entity: 'Contacts', TemplateID: 't-1' } },
        ]), CompositeKey.FromKeyValuePair('ID', 'ABC-123'));

        expect(result.Duplicates).toHaveLength(0);
    });
});

describe('DuplicateRecordDetector.FilterSelfMatches', () => {
    it('should remove matches whose composite key matches the source key', () => {
        // the self-match differs in CASE: the Equals-based filter must still catch it
        const result = detector.FilterSelf([candidate('ABC-123', 0.95), candidate('def-456', 0.88)], CompositeKey.FromKeyValuePair('ID', 'abc-123'));

        expect(result).toHaveLength(1);
        expect(result[0].ProbabilityScore).toBe(0.88);
    });

    it('should return all matches when none match the source key', () => {
        const result = detector.FilterSelf([candidate('match-1', 0.9), candidate('match-2', 0.8)], CompositeKey.FromKeyValuePair('ID', 'source-1'));

        expect(result).toHaveLength(2);
    });

    it('should return empty array when all matches are self-matches', () => {
        const result = detector.FilterSelf([candidate('self-1', 0.99)], CompositeKey.FromKeyValuePair('ID', 'self-1'));

        expect(result).toHaveLength(0);
    });

    it('should handle empty duplicates array', () => {
        expect(detector.FilterSelf([], CompositeKey.FromKeyValuePair('ID', 'any-key'))).toHaveLength(0);
    });
});

describe('DuplicateRecordDetector.buildSourceMetadataMap', () => {
    it('should build a map with entity name and display fields', () => {
        const info = entityInfo('Contacts', 'fa-user', [
            { Name: 'Name', IsNameField: true, DefaultInView: true },
            { Name: 'Title', DefaultInView: true },
            { Name: 'Status', DefaultInView: true },
        ]);

        const map = detector.MetadataMap([record(info, { ID: 'rec-1', Name: 'John Doe', Title: 'Manager', Status: 'Active' })], info);

        expect(map.size).toBe(1);
        const meta = metadataOf(map, 'rec-1');
        expect(meta.Entity).toBe('Contacts');
        expect(meta.EntityIcon).toBe('fa-user');
        expect(meta.Name).toBe('John Doe'); // from IsNameField
        expect(meta.Title).toBe('Manager');
        expect(meta.Status).toBe('Active');
    });

    it('should handle records with no name field', () => {
        const info = entityInfo('Items', null, [{ Name: 'Description', DefaultInView: true }]);

        const meta = metadataOf(detector.MetadataMap([record(info, { ID: 'item-1', Description: 'A test item' })], info), 'item-1');

        expect(meta.Entity).toBe('Items');
        expect(meta.EntityIcon).toBeUndefined();
        expect(meta.Name).toBeUndefined();
        expect(meta.Description).toBe('A test item');
    });

    it('should truncate long display field values to 200 chars', () => {
        const info = entityInfo('Notes', null, [{ Name: 'Description', DefaultInView: true }]);

        const meta = metadataOf(detector.MetadataMap([record(info, { ID: 'note-1', Description: 'x'.repeat(300) })], info), 'note-1');

        expect(meta.Description).toHaveLength(200); // 197 + '...'
        expect(meta.Description.endsWith('...')).toBe(true);
    });

    it('should handle empty records array', () => {
        expect(detector.MetadataMap([], entityInfo('Empty', null, [])).size).toBe(0);
    });

    it('should skip null field values in display fields', () => {
        const info = entityInfo('People', null, [
            { Name: 'Name', IsNameField: true, DefaultInView: true },
            { Name: 'Title', DefaultInView: true },
            { Name: 'Status', DefaultInView: true },
        ]);

        const meta = metadataOf(detector.MetadataMap([record(info, { ID: 'p-1', Name: 'Alice', Title: null, Status: null })], info), 'p-1');

        expect(meta.Name).toBe('Alice');
        expect(meta.Title).toBeUndefined();
        expect(meta.Status).toBeUndefined();
    });

    it('should combine multiple IsNameField fields into Name', () => {
        const info = entityInfo('Contacts', 'fa-user', [
            { Name: 'FirstName', IsNameField: true, DefaultInView: true },
            { Name: 'LastName', IsNameField: true, DefaultInView: true },
            { Name: 'Email', DefaultInView: true },
        ]);

        const meta = metadataOf(detector.MetadataMap([record(info, { ID: 'c-1', FirstName: 'John', LastName: 'Doe', Email: 'john@example.com' })], info), 'c-1');

        expect(meta.Name).toBe('John Doe');
        expect(meta.FirstName).toBe('John');
        expect(meta.LastName).toBe('Doe');
        expect(meta.Email).toBe('john@example.com');
    });

    it('should fall back to the entity NameField when no field sets IsNameField', () => {
        // With no IsNameField flag, EntityInfo.NameField is the field literally called Name (the legacy default)
        const info = entityInfo('OldEntity', null, [{ Name: 'Name', DefaultInView: false }]);

        const meta = metadataOf(detector.MetadataMap([record(info, { ID: 'old-1', Name: 'Legacy Record' })], info), 'old-1');

        expect(meta.Name).toBe('Legacy Record');
    });
});
