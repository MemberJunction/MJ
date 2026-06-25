/**
 * Unit tests for the facade execution layer: RecordProcessExecutor source/processor construction
 * and the output-mapping write-back applier. No database — providers/entities are faked.
 */

import { describe, it, expect } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import {
    ArraySource,
    FilterSource,
    ListSource,
    RecordRef,
    ViewSource,
} from '@memberjunction/record-set-processor-base';
import {
    ActionRecordProcessor,
    AgentRecordProcessor,
    FieldRulesProcessor,
    InferProcessor,
    RecordProcessExecutor,
    WriteBackProcessor,
    applyOutputMapping,
} from '../index';

const USER = {} as UserInfo;
const rp = (over: Partial<Record<string, unknown>>): MJRecordProcessEntity =>
    ({ ID: 'RP-1', Name: 'Test', EntityID: 'ENT-1', ...over } as unknown as MJRecordProcessEntity);
const providerWithEntity = (name = 'Widgets'): IMetadataProvider =>
    ({ EntityByID: () => ({ Name: name, ID: 'ENT-1' }) } as unknown as IMetadataProvider);

describe('RecordProcessExecutor.buildSource', () => {
    const exec = new RecordProcessExecutor();
    const provider = providerWithEntity();

    it('builds a ViewSource for ScopeType=View', () => {
        expect(exec.buildSource(rp({ ScopeType: 'View', ScopeViewID: 'V1' }), provider)).toBeInstanceOf(ViewSource);
    });
    it('builds a ListSource for ScopeType=List', () => {
        expect(exec.buildSource(rp({ ScopeType: 'List', ScopeListID: 'L1' }), provider)).toBeInstanceOf(ListSource);
    });
    it('builds a FilterSource for ScopeType=Filter', () => {
        expect(exec.buildSource(rp({ ScopeType: 'Filter', ScopeFilter: "X=1" }), provider)).toBeInstanceOf(FilterSource);
    });
    it('builds an ArraySource for a single-record override', () => {
        expect(exec.buildSource(rp({ ScopeType: 'View' }), provider, 'rec-9')).toBeInstanceOf(ArraySource);
    });
    it('throws when View scope is missing its ViewID', () => {
        expect(() => exec.buildSource(rp({ ScopeType: 'View' }), provider)).toThrow(/ScopeViewID/);
    });

    describe('runtime scope override (UI invocation — overrides stored Scope)', () => {
        it('records → ArraySource (selected rows)', () => {
            const src = exec.buildSource(rp({ ScopeType: 'Filter', ScopeFilter: 'X=1' }), provider, undefined, { Kind: 'records', RecordIDs: ['a', 'b'] });
            expect(src).toBeInstanceOf(ArraySource);
        });
        it('view → ViewSource', () => {
            expect(exec.buildSource(rp({ ScopeType: 'Filter' }), provider, undefined, { Kind: 'view', ViewID: 'V9' })).toBeInstanceOf(ViewSource);
        });
        it('list → ListSource', () => {
            expect(exec.buildSource(rp({ ScopeType: 'View', ScopeViewID: 'V1' }), provider, undefined, { Kind: 'list', ListID: 'L9' })).toBeInstanceOf(ListSource);
        });
        it('filter → FilterSource', () => {
            expect(exec.buildSource(rp({ ScopeType: 'View' }), provider, undefined, { Kind: 'filter', Filter: 'Status=\'Active\'' })).toBeInstanceOf(FilterSource);
        });
        it('takes precedence over the stored ScopeType', () => {
            // stored scope is View (would need ScopeViewID), but the override wins so no throw
            expect(exec.buildSource(rp({ ScopeType: 'View' }), provider, undefined, { Kind: 'view', ViewID: 'V9' })).toBeInstanceOf(ViewSource);
        });
    });
});

describe('RecordProcessExecutor.buildProcessor', () => {
    const exec = new RecordProcessExecutor();

    it('builds an ActionRecordProcessor for WorkType=Action', () => {
        expect(exec.buildProcessor(rp({ WorkType: 'Action', ActionID: 'A1' }))).toBeInstanceOf(ActionRecordProcessor);
    });
    it('builds an AgentRecordProcessor for WorkType=Agent', () => {
        expect(exec.buildProcessor(rp({ WorkType: 'Agent', AgentID: 'AG1' }))).toBeInstanceOf(AgentRecordProcessor);
    });
    it('builds an InferProcessor for WorkType=Infer', () => {
        expect(exec.buildProcessor(rp({ WorkType: 'Infer', PromptID: 'P1' }))).toBeInstanceOf(InferProcessor);
    });
    it('throws when Infer work is missing its PromptID', () => {
        expect(() => exec.buildProcessor(rp({ WorkType: 'Infer' }))).toThrow(/PromptID/);
    });
    it('wraps an Infer processor with WriteBackProcessor when OutputMapping is set', () => {
        const proc = exec.buildProcessor(rp({
            WorkType: 'Infer', PromptID: 'P1',
            OutputMapping: JSON.stringify({ fields: { S: '$.s' } }),
        }));
        expect(proc).toBeInstanceOf(WriteBackProcessor);
    });
    it('wraps with WriteBackProcessor when OutputMapping has field/child targets', () => {
        const proc = exec.buildProcessor(rp({
            WorkType: 'Action', ActionID: 'A1',
            OutputMapping: JSON.stringify({ fields: { S: '$.s' } }),
        }));
        expect(proc).toBeInstanceOf(WriteBackProcessor);
    });
    it('throws when Action work is missing its ActionID', () => {
        expect(() => exec.buildProcessor(rp({ WorkType: 'Action' }))).toThrow(/ActionID/);
    });

    describe('WorkType=FieldRules', () => {
        const ruleSet = JSON.stringify({ Rules: [{ TargetField: 'Status', Source: { Kind: 'static', Value: 'Inactive' } }] });

        it('builds a FieldRulesProcessor from a rule set in Configuration', () => {
            expect(exec.buildProcessor(rp({ WorkType: 'FieldRules', Configuration: ruleSet }))).toBeInstanceOf(FieldRulesProcessor);
        });
        it('passes the dry-run flag through', () => {
            const proc = exec.buildProcessor(rp({ WorkType: 'FieldRules', Configuration: ruleSet }), true) as FieldRulesProcessor;
            expect((proc as unknown as { options: { DryRun?: boolean } }).options.DryRun).toBe(true);
        });
        it('does NOT wrap with WriteBackProcessor (FieldRules writes itself) even if OutputMapping is set', () => {
            const proc = exec.buildProcessor(rp({ WorkType: 'FieldRules', Configuration: ruleSet, OutputMapping: JSON.stringify({ fields: { S: '$.s' } }) }));
            expect(proc).toBeInstanceOf(FieldRulesProcessor);
            expect(proc).not.toBeInstanceOf(WriteBackProcessor);
        });
        it('throws when Configuration is missing', () => {
            expect(() => exec.buildProcessor(rp({ WorkType: 'FieldRules' }))).toThrow(/FieldRuleSet/);
        });
        it('throws when Configuration has no Rules array', () => {
            expect(() => exec.buildProcessor(rp({ WorkType: 'FieldRules', Configuration: '{"foo":1}' }))).toThrow(/Rules array/);
        });
    });
});

// --- write-back applier --------------------------------------------------------------------------

class FakeEntity {
    public sets: Record<string, unknown> = {};
    public saved = false;
    public readonly LatestResult = { CompleteMessage: '' };
    public readonly FirstPrimaryKey = { Value: 'child-1' };
    public async InnerLoad(): Promise<boolean> { return true; }
    public NewRecord(): boolean { return true; }
    public Set(field: string, value: unknown): void { this.sets[field] = value; }
    public async Save(): Promise<boolean> { this.saved = true; return true; }
}

function fakeProvider(): { provider: IMetadataProvider; created: FakeEntity[] } {
    const created: FakeEntity[] = [];
    const provider = {
        EntityByID: () => ({ Name: 'Customer', PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } }),
        GetEntityObject: async () => { const e = new FakeEntity(); created.push(e); return e; },
    } as unknown as IMetadataProvider;
    return { provider, created };
}

const record: RecordRef = { EntityID: 'ENT-1', RecordID: 'c1', Record: {} };

describe('applyOutputMapping', () => {
    it('updates fields on the processed record from the result', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: { fields: { Satisfaction: '$.satisfaction', Sentiment: '$.sentiment' } },
            result: { satisfaction: 'High', sentiment: 0.8 },
            record,
            contextUser: USER,
            provider,
        });
        expect(out.updatedRecord).toBe(true);
        expect(created[0].sets).toEqual({ Satisfaction: 'High', Sentiment: 0.8 });
        expect(created[0].saved).toBe(true);
    });

    it('creates a child record with the parent FK and mapped fields', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: { childRecord: { entity: 'Customer Insights', parentField: 'CustomerID', map: { Summary: '$.summary' } } },
            result: { summary: 'great' },
            record,
            contextUser: USER,
            provider,
        });
        expect(out.createdChildID).toBe('child-1');
        expect(created[0].sets).toEqual({ CustomerID: 'c1', Summary: 'great' });
    });
});
