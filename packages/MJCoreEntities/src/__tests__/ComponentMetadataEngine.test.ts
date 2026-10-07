/**
 * Unit tests for `ComponentMetadataEngine.FindComponent`: the filter it writes for a lookup by name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformSQL } from '@memberjunction/core';

const { calls } = vi.hoisted(() => ({
    calls: [] as Array<{ EntityName: string; ExtraFilter: string | PlatformSQL; MaxRows?: number }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        public async RunView(params: { EntityName: string; ExtraFilter: string | PlatformSQL; MaxRows?: number }) {
            calls.push(params);
            return { Success: true, Results: [{ ID: 'COMP-1' }] };
        }
    }
    return { ...actual, RunView: StubRunView };
});

import { ComponentMetadataEngine } from '../engines/component-metadata';

beforeEach(() => {
    calls.length = 0;
});

describe('ComponentMetadataEngine.FindComponent', () => {
    it('writes the name as a Unicode literal on SQL Server and as a plain literal elsewhere', async () => {
        await ComponentMetadataEngine.Instance.FindComponent(' Łódź Panel ');
        expect(calls[0]).toMatchObject({ EntityName: 'MJ: Components', MaxRows: 1 });
        expect(calls[0].ExtraFilter).toEqual({
            default: "Name='Łódź Panel'",
            sqlserver: "Name=N'Łódź Panel'",
        });
    });

    it('adds the namespace and registry to both variants, with quotes doubled', async () => {
        await ComponentMetadataEngine.Instance.FindComponent("O'Brien Panel", "acme's", 'Main');
        expect(calls[0].ExtraFilter).toEqual({
            default: "Name='O''Brien Panel' AND Namespace='acme''s' AND SourceRegistry='Main'",
            sqlserver: "Name=N'O''Brien Panel' AND Namespace='acme''s' AND SourceRegistry='Main'",
        });
    });
});
