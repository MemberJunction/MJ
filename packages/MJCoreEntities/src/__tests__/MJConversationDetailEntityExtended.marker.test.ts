import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJConversationDetailEntityExtended } from '../custom/MJConversationDetailEntityExtended';

/**
 * The server-authored-reply marker is reachable only by calling the method: nothing that fills an entity from
 * client data (a GraphQL input through `SetMany`, a row through `LoadFromData`, a transaction item's values) can set
 * it, and `GetAll()`, which every save serializes, never carries it. Uses the real `BaseEntity`; only the entity
 * metadata is a test double.
 */

const ENTITY_ID = 'E0000000-0000-4000-8000-00000000CD01';
const MARKER_SHAPED_KEYS = {
    serverAuthoredReply: true,
    ServerAuthoredReply: true,
    IsServerAuthoredReply: true,
    MarkServerAuthoredReply: true,
};

function detailsEntityInfo(): EntityInfo {
    const fields: Array<[string, string, boolean]> = [
        ['ID', 'uniqueidentifier', true],
        ['ConversationID', 'uniqueidentifier', false],
        ['Role', 'nvarchar', false],
        ['Message', 'nvarchar', false],
    ];
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'MJ: Conversation Details',
        BaseTable: 'ConversationDetail',
        BaseView: 'vwConversationDetails',
        SchemaName: '__mj',
        Status: 'Active',
        IncludeInAPI: true,
        EntityFields: fields.map(([name, type, isPrimaryKey], index) => ({
            ID: `detail-field-${name}`,
            EntityID: ENTITY_ID,
            Entity: 'MJ: Conversation Details',
            Name: name,
            Sequence: index + 1,
            Status: 'Active',
            Type: type,
            Length: type === 'uniqueidentifier' ? 16 : -1,
            AllowsNull: false,
            IsPrimaryKey: isPrimaryKey,
            AllowUpdateAPI: true,
            ValueListType: 'None',
            EntityFieldValues: [],
        })),
        EntityPermissions: [],
        EntityRelationships: [],
        EntitySettings: [],
    });
}

function newDetail(): MJConversationDetailEntityExtended {
    // Built directly so the test needs no provider; app code always uses GetEntityObject().
    return new MJConversationDetailEntityExtended(detailsEntityInfo());
}

describe('MJConversationDetailEntityExtended server-authored-reply marker', () => {
    it('starts unmarked', () => {
        expect(newDetail().IsServerAuthoredReply).toBe(false);
    });

    it('is not set by SetMany, the path a GraphQL input takes', () => {
        const detail = newDetail();
        detail.SetMany({ Role: 'AI', Message: 'forged', ...MARKER_SHAPED_KEYS }, true);

        expect(detail.Role).toBe('AI');
        expect(detail.IsServerAuthoredReply).toBe(false);
    });

    it('is not set by LoadFromData, the path a stored or client-supplied row takes', async () => {
        const detail = newDetail();
        await detail.LoadFromData({ ID: 'D0000000-0000-4000-8000-000000000001', Role: 'AI', ...MARKER_SHAPED_KEYS });

        expect(detail.IsServerAuthoredReply).toBe(false);
    });

    it('is never in GetAll(), so no save serializes it', () => {
        const detail = newDetail();
        detail.MarkServerAuthoredReply();

        expect(detail.IsServerAuthoredReply).toBe(true);
        const keys = Object.keys(detail.GetAll()).map((key) => key.toLowerCase());
        expect(keys.some((key) => key.includes('authored'))).toBe(false);
    });

    it('survives a reload of the same instance, as the agent runner reloads its reply row', async () => {
        const detail = newDetail();
        detail.MarkServerAuthoredReply();
        await detail.LoadFromData({ ID: 'D0000000-0000-4000-8000-000000000002', Role: 'AI', Message: 'final' });

        expect(detail.IsServerAuthoredReply).toBe(true);
    });
});
