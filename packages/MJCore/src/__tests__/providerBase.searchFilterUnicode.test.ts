import { describe, it, expect, vi } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import type { EntityInfo } from '../generic/entityInfo';

/**
 * SearchEntity re-reads the candidate ids through RunView to apply permissions. On SQL Server an
 * nvarchar key must be compared to an N'' literal, or non-ASCII keys miss their row (#5664). The
 * prefix comes from the key column's type (EntityFieldInfo.UnicodePrefix), which is empty on
 * PostgreSQL types.
 */
type FilterFn = (this: unknown, entity: EntityInfo, ids: string[], contextUser?: unknown) => Promise<Set<string>>;
const filterByPermission = (ProviderBase.prototype as unknown as { searchEntitiesFilterByPermission: FilterFn }).searchEntitiesFilterByPermission;

function stubEntity(keys: Array<{ Name: string; UnicodePrefix: string; NeedsQuotes: boolean }>): EntityInfo {
    return { Name: 'Codes', PrimaryKeys: keys, FirstPrimaryKey: keys[0], Fields: keys } as unknown as EntityInfo;
}

async function filterFor(entity: EntityInfo, ids: string[]): Promise<string> {
    const RunView = vi.fn(async () => ({ Success: true, Results: [] }));
    await filterByPermission.call({ RunView }, entity, ids, undefined);
    const params = (RunView.mock.calls[0] as unknown as [{ ExtraFilter: string }])[0];
    return params.ExtraFilter;
}

describe('ProviderBase.searchEntitiesFilterByPermission — Unicode key literals', () => {
    it('writes N\'\' literals for a single nvarchar key', async () => {
        const entity = stubEntity([{ Name: 'Code', UnicodePrefix: 'N', NeedsQuotes: true }]);
        expect(await filterFor(entity, ['日本-01', "O'K"])).toBe("Code IN (N'日本-01',N'O''K')");
    });

    it('keeps plain literals for a varchar or uuid key', async () => {
        const entity = stubEntity([{ Name: 'ID', UnicodePrefix: '', NeedsQuotes: true }]);
        expect(await filterFor(entity, ['K12345'])).toBe("ID IN ('K12345')");
    });

    it('prefixes only the nvarchar column of a composite key', async () => {
        const entity = stubEntity([
            { Name: 'Code', UnicodePrefix: 'N', NeedsQuotes: true },
            { Name: 'Region', UnicodePrefix: '', NeedsQuotes: true },
        ]);
        expect(await filterFor(entity, ['Code|日本||Region|EU'])).toBe("(Code=N'日本' AND Region='EU')");
    });
});
