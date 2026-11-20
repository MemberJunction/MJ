import { describe, it, expect, vi } from 'vitest';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DocumentLiveBlockEngine, LoadDocumentLiveBlocks } from '../custom/DocumentLiveBlockEngine';

LoadDocumentLiveBlocks();

const entity = new EntityInfo({
    ID: 'e-art',
    Name: 'Items',
    BaseView: 'vwItems',
    Fields: [
        new EntityFieldInfo({ ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', TSType: EntityFieldTSType.String }),
        new EntityFieldInfo({ ID: 'f2', Name: 'Name', Type: 'nvarchar', TSType: EntityFieldTSType.String }),
    ],
});

describe('DocumentLiveBlockEngine ExtraFilter screen', () => {
    it('refuses a filter that PostgreSQL reads with dollar-quoted strings', () => {
        const filter = "[Name] = $$ ' $$ OR (SELECT 1) = 1 OR [Name] = $$ ' $$";
        expect(DocumentLiveBlockEngine.Instance.ValidateExtraFilter(filter, entity).Valid).toBe(false);
    });

    it('refuses a filter with double-quoted identifiers', () => {
        const filter = `[Name] = "'" OR (SELECT 1) = 1 OR [Name] = "'"`;
        expect(DocumentLiveBlockEngine.Instance.ValidateExtraFilter(filter, entity).Valid).toBe(false);
    });

    it('returns a generic message when the view query fails', async () => {
        const user = new UserInfo();
        user.ID = '55555555-5555-5555-5555-555555555555';
        const mockEntity = {
            ID: 'ent-items',
            Name: 'Items',
            DisplayNameOrName: 'Items',
            PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }],
            Fields: [
                { Name: 'ID', IsPrimaryKey: true, DefaultInView: true, TSType: EntityFieldTSType.String },
                { Name: 'Name', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String },
            ] as unknown as EntityFieldInfo[],
            FieldLevelSecurityApplies: false,
            GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
        } as unknown as EntityInfo;
        const provider = {
            Entities: [mockEntity],
            EntityByID: () => mockEntity,
            EntityByName: () => mockEntity,
            RunView: vi.fn().mockResolvedValue({ Success: false, ErrorMessage: 'DATABASE_DETAIL_MARKER', Results: [] }),
        } as unknown as IMetadataProvider;

        const result = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
            { BlockID: 'b', Kind: 'EntityView', Mode: 'Live', EntityName: 'Items', ExtraFilter: "Name = 'x'" },
            user,
            provider,
        );
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage ?? '').not.toContain('DATABASE_DETAIL_MARKER');
    });
});
