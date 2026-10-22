/**
 * Unit tests for the Action/Agent record processors' pure mapping + extraction helpers (the
 * record -> work-input mapping and work-output -> result-payload extraction). The engine-invoking
 * ProcessRecord paths are covered by integration tests; here we verify the deterministic logic.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, EntityFieldRules, EntityInfo, UserInfo, type EntityFieldRulesResult } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { RecordRef } from '@memberjunction/record-set-processor-base';
import { ActionRecordProcessor, AgentRecordProcessor, FieldRulesProcessor, WriteBackProcessor } from '../index';
import { TemplateEngineServer } from '@memberjunction/templates';

const record: RecordRef = { EntityID: 'ENT-1', RecordID: 'c1', Record: { ID: 'c1', Name: 'Ada', Tier: 3 } };

describe('ActionRecordProcessor', () => {
    it('builds action input params from the input mapping', () => {
        const params = ActionRecordProcessor.buildActionParams(
            { CustomerID: 'record.ID', Tier: 'record.Tier', Label: 'static:VIP' },
            record,
        );
        expect(params).toEqual([
            { Name: 'CustomerID', Value: 'c1', Type: 'Input' },
            { Name: 'Tier', Value: 3, Type: 'Input' },
            { Name: 'Label', Value: 'VIP', Type: 'Input' },
        ]);
    });

    it('returns no params when there is no input mapping', () => {
        expect(ActionRecordProcessor.buildActionParams(undefined, record)).toEqual([]);
    });

    it('exposes recordId / entityId as mapping sources', () => {
        const params = ActionRecordProcessor.buildActionParams({ rid: 'recordId', eid: 'entityId' }, record);
        expect(params).toEqual([
            { Name: 'rid', Value: 'c1', Type: 'Input' },
            { Name: 'eid', Value: 'ENT-1', Type: 'Input' },
        ]);
    });

    it('extracts only Output / Both params into the result payload', () => {
        const out = ActionRecordProcessor.extractOutputs([
            { Name: 'In1', Value: 'x', Type: 'Input' },
            { Name: 'Out1', Value: 42, Type: 'Output' },
            { Name: 'Both1', Value: true, Type: 'Both' },
        ]);
        expect(out).toEqual({ Out1: 42, Both1: true });
    });

    it('handles missing output params gracefully', () => {
        expect(ActionRecordProcessor.extractOutputs(undefined)).toEqual({});
    });
});

describe('AgentRecordProcessor', () => {
    it('builds agent data from the input mapping', () => {
        const data = AgentRecordProcessor.buildData({ name: 'record.Name', tier: 'record.Tier' }, record);
        expect(data).toEqual({ name: 'Ada', tier: 3 });
    });

    it('passes the whole record as data when there is no mapping', () => {
        const data = AgentRecordProcessor.buildData(undefined, record);
        expect(data).toEqual({ record: { ID: 'c1', Name: 'Ada', Tier: 3 }, recordId: 'c1', entityId: 'ENT-1' });
    });
});

describe('WriteBackProcessor — run-level Preflight forwarding', () => {
    const ctx = { ContextUser: {} as never, Provider: {} as never };

    it('forwards Preflight to the wrapped processor so its refusal reaches the engine', async () => {
        const inner = {
            ProcessRecord: async () => ({ Status: 'Succeeded' as const }),
            Preflight: async () => { throw new Error('needs training'); },
        };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        await expect(wrapped.Preflight(ctx)).rejects.toThrow('needs training');
    });

    it('is a no-op when the wrapped processor declares no Preflight', async () => {
        const inner = { ProcessRecord: async () => ({ Status: 'Succeeded' as const }) };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        await expect(wrapped.Preflight(ctx)).resolves.toBeUndefined();
    });
});

describe('WriteBackProcessor.ProcessBatch — inner result shapes', () => {
    const ctx = { ContextUser: {} as never, Provider: {} as never };
    const recordsIn: RecordRef[] = [
        { EntityID: 'E', RecordID: 'a' },
        { EntityID: 'E', RecordID: 'b' },
    ];

    it('accepts a positionally-aligned array from the inner processor (as the ML scorer returns)', async () => {
        const inner = {
            ProcessRecord: async () => ({ Status: 'Failed' as const }),
            ProcessBatch: async () => [
                { Status: 'Failed' as const, ErrorMessage: 'first' },
                { Status: 'Failed' as const, ErrorMessage: 'second' },
            ],
        };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        const out = await wrapped.ProcessBatch(recordsIn, ctx);
        expect(out.get('a')?.ErrorMessage).toBe('first');
        expect(out.get('b')?.ErrorMessage).toBe('second');
    });

    it('still accepts a RecordID-keyed Map', async () => {
        const inner = {
            ProcessRecord: async () => ({ Status: 'Failed' as const }),
            ProcessBatch: async () => new Map([['b', { Status: 'Failed' as const, ErrorMessage: 'only-b' }]]),
        };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        const out = await wrapped.ProcessBatch(recordsIn, ctx);
        expect(out.get('a')?.ErrorMessage).toBe('No result returned from batch processor');
        expect(out.get('b')?.ErrorMessage).toBe('only-b');
    });
});

/** A Widgets record that loads any key (the processor only loads it before applying the rules). */
class LoadedWidget extends BaseEntity {
    public override async InnerLoad(): Promise<boolean> {
        return true;
    }
}

describe('FieldRulesProcessor on a dry run', () => {
    afterEach(() => vi.restoreAllMocks());

    it('previews when the run is a dry run, whatever it was built with', async () => {
        const preview: Pick<EntityFieldRulesResult, 'DryRun' | 'Changes' | 'AppliedFields' | 'Errors'> = { DryRun: true, Changes: [], AppliedFields: [], Errors: [] };
        const apply = vi.spyOn(EntityFieldRules.prototype, 'ApplyToEntity').mockResolvedValue(preview as EntityFieldRulesResult);
        const widgets = new EntityInfo({ ID: 'E', Name: 'Widgets', Fields: [{ Name: 'ID', IsPrimaryKey: true, TSType: 'string' }] });
        const provider = new EntitiesOnlyProvider([widgets]);
        vi.spyOn(provider, 'GetEntityObject').mockResolvedValue(new LoadedWidget(widgets));
        const processor = new FieldRulesProcessor({ RuleSet: { Rules: [] } });
        const result = await processor.ProcessRecord({ EntityID: 'E', RecordID: 'w1' }, { ContextUser: new UserInfo(), Provider: provider, DryRun: true });
        expect(result.Status).toBe('Succeeded');
        expect(apply.mock.calls[0][2]).toEqual({ DryRun: true });
    });
});

describe('FieldRulesProcessor entity-document source', () => {
    afterEach(() => vi.restoreAllMocks());

    /** Exposes the protected resolver an `entityDocument` rule source calls. */
    class ResolverProbe extends FieldRulesProcessor {
        public Resolver(context: Parameters<FieldRulesProcessor['ProcessRecord']>[1]) {
            return (this as unknown as { buildEntityDocumentResolver(c: typeof context): (a: { EntityDocumentID: string; Record: Record<string, unknown> }) => Promise<string> })
                .buildEntityDocumentResolver(context);
        }
    }

    it('renders the document as the run user, never as whoever configured the shared template engine', async () => {
        const engine = TemplateEngineServer.Instance;
        vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
        const render = vi.spyOn(engine, 'RenderTemplateSimple').mockResolvedValue({ Success: true, Output: 'doc', Message: undefined });
        const user = new UserInfo();
        const provider = new EntitiesOnlyProvider([]);
        vi.spyOn(provider, 'GetEntityObject').mockResolvedValue({ Load: async () => true, TemplateText: 'Name {{ Name }}' } as never);

        const text = await new ResolverProbe({ RuleSet: { Rules: [] } }).Resolver({ ContextUser: user, Provider: provider })({ EntityDocumentID: 'doc-1', Record: { Name: 'Ada' } });

        expect(text).toBe('doc');
        expect(render.mock.calls[0][2]).toEqual({ autoescape: false, ContextUser: user });
    });
});
