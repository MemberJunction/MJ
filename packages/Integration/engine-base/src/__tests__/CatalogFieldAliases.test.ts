/**
 * The per-connection field table stores `CompanyIntegrationObjectID` and
 * `RelatedCompanyIntegrationObjectID`. Connector code resolving a dependency edge reads the LEGACY
 * names (`f.RelatedIntegrationObjectID` matched against sibling objects — Rhythm, PathLMS), so the
 * projection has to answer to both.
 *
 * These were once expected to come from alias columns on the base view. They cannot: that view is
 * CodeGen-generated, so a hand-added alias is dropped the next time CodeGen runs. The derivation
 * lives in `projectCatalogFields` instead, and this file is what pins it there.
 */
import { describe, it, expect } from 'vitest';
import { projectCatalogFields, CATALOG_FIELD_COLUMNS } from '../CompanyIntegrationCatalog';
import type { BaseEntity } from '@memberjunction/core';

/** A stand-in for a loaded row: `Get` answers only for columns the VIEW really has. */
function rowWith(values: Record<string, unknown>): BaseEntity {
    return {
        Fields: Object.keys(values).map(Name => ({ Name })),
        Get: (c: string) => values[c],
    } as unknown as BaseEntity;
}

const REAL_COLUMNS = () => {
    const v: Record<string, unknown> = {};
    for (const c of CATALOG_FIELD_COLUMNS) v[c] = null;
    v['CompanyIntegrationObjectID'] = 'obj-1';
    v['RelatedCompanyIntegrationObjectID'] = 'obj-2';
    return v;
};

describe('per-connection field read aliases', () => {
    it('derives the legacy names from the per-connection columns', () => {
        const [row] = projectCatalogFields([rowWith(REAL_COLUMNS())]);
        expect(row.IntegrationObjectID).toBe('obj-1');
        expect(row.RelatedIntegrationObjectID).toBe('obj-2');
    });

    it('carries a null related edge through as null rather than undefined', () => {
        const vals = REAL_COLUMNS();
        vals['RelatedCompanyIntegrationObjectID'] = null;
        const [row] = projectCatalogFields([rowWith(vals)]);
        expect(row.RelatedIntegrationObjectID).toBeNull();
    });

    it('does not require the aliases to exist as columns on the row', () => {
        // The generated view exposes neither name. Projection must still succeed - if the alias
        // names were in the validated column set this would throw a schema mismatch.
        const vals = REAL_COLUMNS();
        expect(Object.keys(vals)).not.toContain('IntegrationObjectID');
        expect(Object.keys(vals)).not.toContain('RelatedIntegrationObjectID');
        expect(() => projectCatalogFields([rowWith(vals)])).not.toThrow();
    });

    it('still fails loud when a REAL column is missing (guard not weakened)', () => {
        const vals = REAL_COLUMNS();
        delete vals['ObservedMaxLength'];
        expect(() => projectCatalogFields([rowWith(vals)])).toThrow(/ObservedMaxLength/);
    });
});
