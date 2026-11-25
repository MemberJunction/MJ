/**
 * Field maps are not resident.
 *
 * A deployment can hold tens of thousands of Company Integration Field Maps, and every consumer
 * reads them one entity map at a time. So Config does not load the table, and a consumer reads
 * one entity map's field maps through `LoadFieldMapsForEntityMap`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IRunViewProvider, RunViewParams } from '@memberjunction/core';
import { IntegrationEngineBase } from '../IntegrationEngineBase';

const ENTITY_MAP = 'EEEEEEEE-1111-2222-3333-444444444444';

describe('field maps are not resident', () => {
    it('Config does not register the field-map dataset', async () => {
        const engine = IntegrationEngineBase.Instance;
        const captured: string[][] = [];
        const host = engine as unknown as { Load(params: Array<{ PropertyName: string; EntityName?: string }>): Promise<void> };
        const savedLoad = host.Load;
        host.Load = async params => { captured.push(params.map(p => p.EntityName ?? p.PropertyName)); };
        try {
            await engine.Config(false, {} as never, { EntityByName: (n: string) => ({ Name: n }) } as never);
        } finally {
            host.Load = savedLoad;
        }
        expect(captured).toHaveLength(1);
        expect(captured[0]).toContain('MJ: Company Integration Entity Maps');
        expect(captured[0]).not.toContain('MJ: Company Integration Field Maps');
    });

    it('LoadFieldMapsForEntityMap reads only the given entity map, through the given provider', async () => {
        const rows = [{ ID: 'fm-1', EntityMapID: ENTITY_MAP }];
        const runView = vi.fn(async (_params: RunViewParams) => ({ Success: true, Results: rows }));
        const provider = { RunView: runView } as unknown as IRunViewProvider;

        const result = await IntegrationEngineBase.Instance.LoadFieldMapsForEntityMap(ENTITY_MAP, undefined, provider);

        expect(result).toBe(rows);
        expect(runView).toHaveBeenCalledTimes(1);
        const params = runView.mock.calls[0][0];
        expect(params.EntityName).toBe('MJ: Company Integration Field Maps');
        expect(params.ExtraFilter).toBe(`EntityMapID='${ENTITY_MAP}'`);
    });
});
