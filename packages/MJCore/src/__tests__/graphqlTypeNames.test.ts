import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';
import { getGraphQLTypeNameBase, getSchemaPrefix } from '../generic/graphqlTypeNames';

/**
 * Builds a minimal EntityInfo carrying only the three fields getGraphQLTypeNameBase reads
 * (SchemaName, CanonicalSchemaName, BaseTable). EntityInfo's fields are plain public
 * properties populated via copyInitData, so a bare initData object is sufficient — no
 * provider or DB is touched.
 */
function makeEntity(fields: { SchemaName: string; BaseTable: string; CanonicalSchemaName?: string | null }): EntityInfo {
    const e = new EntityInfo();
    e.SchemaName = fields.SchemaName;
    e.BaseTable = fields.BaseTable;
    e.CanonicalSchemaName = fields.CanonicalSchemaName ?? null;
    return e;
}

describe('getGraphQLTypeNameBase', () => {
    it('uses SchemaName for the prefix when CanonicalSchemaName is null (SQL Server / existing installs)', () => {
        // Canonical absent -> falls back to SchemaName. On SQL Server SchemaName is already
        // canonical-cased, so this is the net-zero path.
        const entity = makeEntity({ SchemaName: 'mjBizAppsCommon', BaseTable: 'Person', CanonicalSchemaName: null });
        expect(getGraphQLTypeNameBase(entity)).toBe('mjBizAppsCommonPerson');
    });

    it('prefers CanonicalSchemaName over the (lowercased) SchemaName when present (PostgreSQL)', () => {
        // On PG the physical SchemaName is folded to lowercase; the canonical casing comes from
        // the manifest. The type name must follow the canonical casing to match published packages.
        const entity = makeEntity({
            SchemaName: 'mjbizappscommon',
            BaseTable: 'Person',
            CanonicalSchemaName: 'mjBizAppsCommon',
        });
        expect(getGraphQLTypeNameBase(entity)).toBe('mjBizAppsCommonPerson');
    });

    it('falls back to SchemaName when CanonicalSchemaName is undefined', () => {
        const entity = makeEntity({ SchemaName: 'sales', BaseTable: 'Invoice' });
        entity.CanonicalSchemaName = undefined as unknown as string;
        expect(getGraphQLTypeNameBase(entity)).toBe('salesInvoice');
    });

    it('maps the core __mj schema to the MJ prefix regardless of which schema field is used', () => {
        // __mj is never overridden by a canonical name; the special-case mapping holds.
        const entity = makeEntity({ SchemaName: '__mj', BaseTable: 'AIModel', CanonicalSchemaName: null });
        expect(getGraphQLTypeNameBase(entity)).toBe('MJAIModel');
    });

    it('keeps the client/server prefix aligned with getSchemaPrefix on the canonical name', () => {
        // The type name prefix must equal getSchemaPrefix(canonical) — the same value the SQL
        // vwEntities ClassName derives via COALESCE(CanonicalSchemaName, SchemaName).
        const canonical = 'mjBizAppsCommon';
        const entity = makeEntity({ SchemaName: 'mjbizappscommon', BaseTable: 'Address', CanonicalSchemaName: canonical });
        expect(getGraphQLTypeNameBase(entity)).toBe(`${getSchemaPrefix(canonical)}Address`);
    });
});
