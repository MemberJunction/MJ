/**
 * @fileoverview A vector metadata field written under its own key (5.11), and added to the curated default.
 *
 * `Fields[<name>].MetadataKey` writes a field under another key (Date as ContentDate); the keys that identify
 * the vector's record are refused. A field marked `Included` adds to the curated default set, so a product can
 * keep that set and add one field without listing every other.
 */
import { describe, expect, it, vi } from 'vitest';
import { ContentVectorMetadataBuilder, ResolvedVectorStorageConfig } from '../Engine/generic/ContentVectorMetadata';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

const FIELDS = [
    { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
    { Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, MaxLength: 500 },
    { Name: 'Date', Type: 'datetimeoffset', IsPrimaryKey: false },
    { Name: 'Audience', Type: 'nvarchar', IsPrimaryKey: false, MaxLength: 200 },
];
const ROW = { ID: 'I1', Name: 'Annual Report', Date: '2026-03-01T00:00:00.000Z', Audience: 'Members', ContentSourceID: 'S1', ContentSourceTypeID: 'T1', URL: 'https://x.test/a' };
const ITEM = { ...ROW, Description: null, GetAll: () => ROW };
const ENTITY = { Name: 'MJ: Content Items', Icon: null, Fields: FIELDS };

function build(metadata: ResolvedVectorStorageConfig['metadata']) {
    return new ContentVectorMetadataBuilder({} as never).Build(
        { Item: ITEM as never, IsItemLevel: false, ChunkID: 'C1', ChunkIndex: 0 },
        [],
        { vectorIDStrategy: 'recordId', chunkTextStorage: 'alwaysChunk', metadata },
        ENTITY as never,
    );
}

describe('a field under its own key', () => {
    it('adds a field marked Included to the curated default, under its MetadataKey and stored as asked', () => {
        const meta = build({ Fields: { Date: { Included: true, StoreAs: 'epochSeconds', MetadataKey: 'ContentDate' } } });

        expect(meta.ContentDate).toBe(Math.floor(new Date('2026-03-01T00:00:00.000Z').getTime() / 1000));
        expect(meta.Date).toBeUndefined();
        // The curated set is still there.
        expect(meta).toMatchObject({ Title: 'Annual Report', URL: 'https://x.test/a', ContentSourceID: 'S1', Entity: 'MJ: Content Item Chunks', RecordID: 'C1' });
    });

    it('leaves the curated default exactly as it was when no field is marked Included', () => {
        const meta = build({ Fields: { Date: { StoreAs: 'epochSeconds', MetadataKey: 'ContentDate' } } });
        expect(meta.ContentDate).toBeUndefined();
        expect(Object.keys(meta).sort()).toEqual(['ContentItemID', 'ContentSourceID', 'ContentSourceTypeID', 'Entity', 'RecordID', 'Sequence', 'Title', 'URL'].sort());
    });

    it('renames a field under a field strategy too', () => {
        const meta = build({ FieldStrategy: 'include', Fields: { Name: { Included: true, MetadataKey: 'Title' }, Audience: { Included: true, MetadataKey: 'Segment' } } });
        expect(meta).toMatchObject({ Title: 'Annual Report', Segment: 'Members' });
        expect(meta.Name).toBeUndefined();
    });

    it("refuses a key that identifies the vector's record, and leaves that field out", () => {
        const meta = build({ Fields: { Audience: { Included: true, MetadataKey: 'RecordID' } } });
        expect(meta.RecordID).toBe('C1');
        expect(Object.values(meta)).not.toContain('Members');
    });
});
