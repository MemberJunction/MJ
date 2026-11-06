import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';

/**
 * A list-scoped vectorize run filters the entity's rows to the list's members. The filter must run
 * on PostgreSQL as well as SQL Server: the single-key form casts `RecordID` to the key's type (no
 * `uuid = text` operator on PostgreSQL), and the composite form builds the `F1|v1||F2|v2` record id
 * with `CONCAT` rather than T-SQL `+` and `NVARCHAR(MAX)` (#5239). The list id is escaped.
 */

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => (_target: unknown) => {},
        RequiresSubclass: () => (_target: unknown) => {},
        OptionalKeyedSpecialization: () => (_target: unknown) => {},
        MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn() };
});

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai', () => ({}));
vi.mock('@memberjunction/ai-prompts', () => ({ AIEmbeddingRunner: class {} }));
vi.mock('@memberjunction/ai-vectordb', () => ({ VectorDBBase: class {} }));
vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class {
        Provider: unknown;
        constructor(provider?: unknown) { this.Provider = provider; }
    },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn() } } }));
vi.mock('@memberjunction/templates', () => ({ TemplateEngineServer: { Instance: {} } }));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import { EntityVectorSyncer } from '../models/entityVectorSync';

class TestSyncer extends EntityVectorSyncer {
    public ListFilter(entity: EntityInfo, schema: string, listId: string): string {
        return this.BuildListFilter(entity, schema, listId);
    }
}

function entityWithKeys(keys: Array<{ Name: string; Type: string }>): EntityInfo {
    return { PrimaryKeys: keys } as unknown as EntityInfo;
}

const syncer = new TestSyncer({} as IMetadataProvider);

describe('EntityVectorSyncer.BuildListFilter', () => {
    it('casts RecordID to a single uuid key (typed uniqueidentifier by metadata) and escapes the list id', () => {
        const filter = syncer.ListFilter(entityWithKeys([{ Name: 'ID', Type: 'uniqueidentifier' }]), '__mj', "l'1");
        expect(filter).toBe("ID IN (SELECT CAST(RecordID AS uniqueidentifier) FROM __mj.vwListDetails WHERE ListID='l''1')");
    });

    it('matches a composite key with CONCAT, not T-SQL + concatenation', () => {
        const filter = syncer.ListFilter(
            entityWithKeys([{ Name: 'OrderID', Type: 'uniqueidentifier' }, { Name: 'LineNo', Type: 'int' }]),
            'mj_core',
            'list-1'
        );
        expect(filter).toBe(
            "CONCAT('OrderID|', [OrderID], '||', 'LineNo|', [LineNo]) IN (SELECT RecordID FROM mj_core.vwListDetails WHERE ListID='list-1')"
        );
        expect(filter).not.toContain('NVARCHAR');
        expect(filter).not.toContain(' + ');
    });
});
