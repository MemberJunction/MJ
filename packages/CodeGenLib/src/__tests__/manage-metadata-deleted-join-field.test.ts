import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * Renaming an FK column (LLMModelID → AIModelID) left the old EntityRelationship behind. CodeGen's relationship
 * pass runs while the old field row still exists, so it keeps the old relationship and adds one for the new column;
 * the old field row is deleted later (spDeleteUnneededEntityFields) and nothing removed the relationship joined on it.
 * deleteUnneededEntityFields now removes exactly the relationships joined on the fields it deleted.
 */
class TestableManageMetadata extends ManageMetadataBase {
    public cleanupSQL(deleted: Array<{ EntityID?: unknown; Name?: unknown }>): string {
        return this.BuildDeletedJoinFieldRelationshipSQL(deleted);
    }
}

const FEATURE_VALUE = '3BED585D-B150-4899-AB06-8A19624EA9BE';

describe('BuildDeletedJoinFieldRelationshipSQL', () => {
    const mm = new TestableManageMetadata();

    it('removes the auto-maintained One To Many relationship joined on a deleted field of that child entity', () => {
        const sql = mm.cleanupSQL([{ EntityID: FEATURE_VALUE, Name: 'LLMModelID' }]);
        expect(sql).toContain('DELETE FROM');
        expect(sql).toMatch(/RelatedEntityID\W+ = '3BED585D-B150-4899-AB06-8A19624EA9BE'/);
        expect(sql).toMatch(/RelatedEntityJoinField\W+ = 'LLMModelID'/);
        expect(sql).toMatch(/Type\W+ = 'One To Many'/);
        expect(sql).toMatch(/AutoUpdateFromSchema\W+ = (1|true)/);
    });

    it('requires physical evidence: the column must be gone from the entity\'s base table, not only from a broken view', () => {
        const sql = mm.cleanupSQL([{ EntityID: FEATURE_VALUE, Name: 'LLMModelID' }]);
        expect(sql).toContain('NOT EXISTS');
        expect(sql).toContain('INFORMATION_SCHEMA.COLUMNS');
        expect(sql).toContain("c.COLUMN_NAME = 'LLMModelID'");
    });

    it('builds one statement per deleted field and nothing when none was deleted', () => {
        expect(mm.cleanupSQL([])).toBe('');
        const sql = mm.cleanupSQL([{ EntityID: FEATURE_VALUE, Name: 'A' }, { EntityID: FEATURE_VALUE, Name: 'B' }]);
        expect(sql.match(/DELETE FROM/g)).toHaveLength(2);
    });

    it('skips a row it cannot match safely and escapes the field name', () => {
        expect(mm.cleanupSQL([{ EntityID: 'not-a-uuid', Name: 'X' }, { EntityID: FEATURE_VALUE, Name: '' }, { Name: 'X' }])).toBe('');
        expect(mm.cleanupSQL([{ EntityID: FEATURE_VALUE, Name: "O'Brien" }])).toContain("'O''Brien'");
    });
});
