/**
 * Unit tests for the facade execution layer: RecordProcessExecutor source/processor construction
 * and the output-mapping write-back applier. No database — providers/entities are faked.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJRecordProcessEntity, MJTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';
import { TagEngine } from '@memberjunction/tag-engine';
import {
    ArraySource,
    FilterSource,
    IRecordProcessor,
    ListSource,
    RecordProcessorRegistry,
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
    it('validates materialization targets when building InferProcessor with DataFeatureSpec', () => {
        const testEntity = {
            ID: 'ENT-1',
            Name: 'Widgets',
            Fields: [
                { Name: 'ID', TSType: 'string', IsPrimaryKey: true, IsVirtual: false },
                { Name: 'Score', Type: 'decimal', Precision: 5, Scale: 4, TSType: 'number', IsVirtual: false },
            ],
        };
        const testProvider = {
            EntityByID: (id: string) => (id === 'ENT-1' ? testEntity : undefined),
            EntityByName: (name: string) => (name.toLowerCase() === 'widgets' ? testEntity : undefined),
        } as unknown as IMetadataProvider;

        // Valid spec with Min: 0, Max: 1
        const validSpec = {
            Name: 'Valid Pipeline',
            Description: 'Valid',
            PromptID: 'P1',
            Context: { Fields: ['Name'] },
            Outputs: [
                {
                    Ref: '$.score',
                    Name: 'Score',
                    Target: { Mode: 'field', EntityFieldName: 'Score' },
                    Constraint: { Type: 'numeric', Min: 0, Max: 1, OnViolation: 'fail' },
                },
            ],
            Caching: { Cacheable: false },
        };
        const proc = exec.buildProcessor(
            rp({ WorkType: 'Infer', PromptID: 'P1', EntityID: 'ENT-1', Configuration: JSON.stringify(validSpec) }),
            false,
            testProvider
        );
        expect(proc).toBeInstanceOf(InferProcessor);

        // Invalid spec with Max: 100 on decimal(5,4)
        const invalidSpec = {
            ...validSpec,
            Outputs: [
                {
                    Ref: '$.score',
                    Name: 'Score',
                    Target: { Mode: 'field', EntityFieldName: 'Score' },
                    Constraint: { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' },
                },
            ],
        };
        expect(() =>
            exec.buildProcessor(
                rp({ WorkType: 'Infer', PromptID: 'P1', EntityID: 'ENT-1', Configuration: JSON.stringify(invalidSpec) }),
                false,
                testProvider
            )
        ).toThrow(/invalid materialization targets.*arithmetic overflow/);

        // Invalid spec targeting nonexistent field
        const badFieldSpec = {
            ...validSpec,
            Outputs: [
                {
                    Ref: '$.score',
                    Name: 'Score',
                    Target: { Mode: 'field', EntityFieldName: 'NoSuchField' },
                },
            ],
        };
        expect(() =>
            exec.buildProcessor(
                rp({ WorkType: 'Infer', PromptID: 'P1', EntityID: 'ENT-1', Configuration: JSON.stringify(badFieldSpec) }),
                false,
                testProvider
            )
        ).toThrow(/invalid materialization targets.*does not exist/);
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

    // The pluggable registry seam: a work type the built-in switch doesn't know about is resolved via
    // the RecordProcessorRegistry (how external packages — e.g. Predictive Studio's 'ML Model' scoring —
    // teach the substrate a new work type without this package depending on them).
    describe('pluggable processor registry', () => {
        class CustomProcessor implements IRecordProcessor {
            constructor(public readonly workType: string) {}
            async ProcessRecord() { return { Status: 'Succeeded' as const }; }
        }

        afterEach(() => RecordProcessorRegistry.Instance.Unregister('My Custom Work'));

        it('resolves a registered processor for a non-built-in work type', () => {
            RecordProcessorRegistry.Instance.Register('My Custom Work', (c) => new CustomProcessor(c.WorkType));
            const proc = exec.buildProcessor(rp({ WorkType: 'My Custom Work' }));
            expect(proc).toBeInstanceOf(CustomProcessor);
            expect((proc as CustomProcessor).workType).toBe('My Custom Work');
        });

        it('passes the Record Process config through the build context to the factory', () => {
            let seenConfig: string | null | undefined;
            RecordProcessorRegistry.Instance.Register('My Custom Work', (c) => {
                seenConfig = c.Configuration;
                return new CustomProcessor(c.WorkType);
            });
            exec.buildProcessor(rp({ WorkType: 'My Custom Work', Configuration: '{"modelId":"m1"}' }));
            expect(seenConfig).toBe('{"modelId":"m1"}');
        });

        it('wraps a registered processor with WriteBackProcessor when OutputMapping is set', () => {
            RecordProcessorRegistry.Instance.Register('My Custom Work', (c) => new CustomProcessor(c.WorkType));
            const proc = exec.buildProcessor(rp({
                WorkType: 'My Custom Work',
                OutputMapping: JSON.stringify({ fields: { S: '$.s' } }),
            }));
            expect(proc).toBeInstanceOf(WriteBackProcessor);
        });

        it('still throws "unsupported WorkType" when nothing is registered for the work type', () => {
            expect(() => exec.buildProcessor(rp({ WorkType: 'Totally Unknown' }))).toThrow(/unsupported WorkType/);
        });
    });
});

// --- write-back applier --------------------------------------------------------------------------

class FakeEntity {
    public sets: Record<string, unknown> = {};
    public saved = false;
    public readonly LatestResult = { CompleteMessage: '' };
    constructor(public readonly PrimaryKey: CompositeKey = CompositeKey.FromKeyValuePair('ID', 'child-1')) {}
    public async InnerLoad(): Promise<boolean> { return true; }
    public NewRecord(): boolean { return true; }
    public Set(field: string, value: unknown): void { this.sets[field] = value; }
    public async Save(): Promise<boolean> { this.saved = true; return true; }
}

function fakeProvider(childKey?: CompositeKey, primaryKeys: Array<{ Name: string }> = [{ Name: 'ID' }]): { provider: IMetadataProvider; created: FakeEntity[] } {
    const created: FakeEntity[] = [];
    const provider = {
        EntityByID: () => ({ Name: 'Customer', PrimaryKeys: primaryKeys, FirstPrimaryKey: primaryKeys[0] }),
        EntityByName: (name: string) => ({ ID: 'ENT-' + name, Name: name, PrimaryKeys: [{ Name: 'ID' }] }),
        GetEntityObject: async () => { const e = new FakeEntity(childKey); created.push(e); return e; },
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

    it('reports a composite-keyed child by its whole key, not just the first column', async () => {
        const compositeKey = CompositeKey.FromKeyValuePairs([
            { FieldName: 'OrderID', Value: '11055' },
            { FieldName: 'LineNo', Value: 3 },
        ]);
        const { provider } = fakeProvider(compositeKey);
        const out = await applyOutputMapping({
            outputMapping: { childRecord: { entity: 'Order Line Notes', parentField: 'OrderID', map: { Note: '$.note' } } },
            result: { note: 'n' },
            record,
            contextUser: USER,
            provider,
        });
        expect(out.createdChildID).toBe('OrderID|11055||LineNo|3');
    });

    it('dry-run resolves field values into previewFields but saves NOTHING', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: { fields: { Satisfaction: '$.satisfaction', Sentiment: '$.sentiment' } },
            result: { satisfaction: 'High', sentiment: 0.8 },
            record,
            contextUser: USER,
            provider,
            dryRun: true,
        });
        expect(out.dryRun).toBe(true);
        expect(out.updatedRecord).toBe(false);
        expect(out.previewFields).toEqual({ Satisfaction: 'High', Sentiment: 0.8 });
        // No entity object is even created on a dry-run (nothing loaded, nothing saved).
        expect(created.length).toBe(0);
    });

    it('dry-run previews the child record values but creates NOTHING', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: { childRecord: { entity: 'Customer Insights', parentField: 'CustomerID', map: { Summary: '$.summary' } } },
            result: { summary: 'great' },
            record,
            contextUser: USER,
            provider,
            dryRun: true,
        });
        expect(out.dryRun).toBe(true);
        expect(out.createdChildID).toBeUndefined();
        expect(out.previewChild).toEqual({ CustomerID: 'c1', Summary: 'great' });
        expect(created.length).toBe(0);
    });

    it('WriteBackProcessor threads dryRun through so the inner work runs but nothing is saved', async () => {
        const { provider, created } = fakeProvider();
        const inner: IRecordProcessor = {
            ProcessRecord: async () => ({ Status: 'Succeeded', ResultPayload: { satisfaction: 'High' } }),
        };
        const proc = new WriteBackProcessor(inner, { fields: { Satisfaction: '$.satisfaction' } }, true);
        const result = await proc.ProcessRecord(record, { contextUser: USER, provider } as unknown as RecordProcessorContext);
        expect(result.Status).toBe('Succeeded');
        // The write-back payload carries the dry-run preview; the entity was never created/saved.
        const writeBack = (result.ResultPayload as { writeBack: { dryRun?: boolean; previewFields?: Record<string, unknown> } }).writeBack;
        expect(writeBack.dryRun).toBe(true);
        expect(writeBack.previewFields).toEqual({ Satisfaction: 'High' });
        expect(created.length).toBe(0);
    });

    it('updates fields on a composite-keyed record without throwing', async () => {
        const compositeKey = CompositeKey.FromKeyValuePairs([
            { FieldName: 'OrderID', Value: '100' },
            { FieldName: 'LineNo', Value: 2 },
        ]);
        const { provider, created } = fakeProvider(compositeKey, [
            { Name: 'OrderID' },
            { Name: 'LineNo' },
        ]);
        const compositeRecord: RecordRef = {
            EntityID: 'ENT-OrderDetail',
            RecordID: 'OrderID|100||LineNo|2',
            Record: {},
        };
        const out = await applyOutputMapping({
            outputMapping: { fields: { Discount: '$.discount' } },
            result: { discount: 0.15 },
            record: compositeRecord,
            contextUser: USER,
            provider,
        });
        expect(out.updatedRecord).toBe(true);
        expect(created[0].sets).toEqual({ Discount: 0.15 });
        expect(created[0].saved).toBe(true);
    });

    it('maps $run provenance to fields and child records', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: {
                fields: {
                    ProcessRunID: '$run.ProcessRunID',
                    PromptVersion: '$run.PromptVersionHash',
                },
                childRecord: {
                    entity: 'AuditLog',
                    parentField: 'ParentID',
                    map: {
                        RunID: '$run.ProcessRunID',
                        ExecutedAt: '$run.ExecutedAt',
                    },
                },
            },
            result: { dummy: 1 },
            record,
            contextUser: USER,
            provider,
            run: {
                ProcessRunID: 'RUN-123',
                PromptVersionHash: 'HASH-XYZ',
                ExecutedAt: '2026-09-21T00:00:00.000Z',
            },
        });
        expect(out.updatedRecord).toBe(true);
        expect(created[0].sets).toEqual({
            ProcessRunID: 'RUN-123',
            PromptVersion: 'HASH-XYZ',
        });
        expect(created[1].sets).toEqual({
            ParentID: 'c1',
            RunID: 'RUN-123',
            ExecutedAt: '2026-09-21T00:00:00.000Z',
        });
    });

    it('supports childRecords with array fan-out', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: {
                childRecords: [
                    {
                        entity: 'OrderLine',
                        parentField: 'OrderID',
                        fanOutRef: '$.items',
                        map: {
                            Sku: '$.sku',
                            Qty: '$.quantity',
                            TotalScore: 'parent.overallScore',
                            RunID: '$run.ProcessRunID',
                        },
                    },
                ],
            },
            result: {
                overallScore: 99,
                items: [
                    { sku: 'ITEM-1', quantity: 2 },
                    { sku: 'ITEM-2', quantity: 5 },
                ],
            },
            record,
            contextUser: USER,
            provider,
            run: { ProcessRunID: 'RUN-456' },
        });
        expect(out.createdChildIDs?.length).toBe(2);
        expect(created.length).toBe(2);
        expect(created[0].sets).toEqual({
            OrderID: 'c1',
            Sku: 'ITEM-1',
            Qty: 2,
            TotalScore: 99,
            RunID: 'RUN-456',
        });
        expect(created[1].sets).toEqual({
            OrderID: 'c1',
            Sku: 'ITEM-2',
            Qty: 5,
            TotalScore: 99,
            RunID: 'RUN-456',
        });
    });

    it('dry-run previews fan-out child records in previewChildren without saving', async () => {
        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: {
                childRecords: [
                    {
                        entity: 'OrderLine',
                        parentField: 'OrderID',
                        fanOutRef: '$.items',
                        map: { Sku: '$.sku', Qty: '$.quantity' },
                    },
                ],
            },
            result: {
                items: [
                    { sku: 'ITEM-A', quantity: 1 },
                    { sku: 'ITEM-B', quantity: 3 },
                ],
            },
            record,
            contextUser: USER,
            provider,
            dryRun: true,
        });
        expect(out.dryRun).toBe(true);
        expect(out.createdChildIDs).toBeUndefined();
        expect(created.length).toBe(0);
        expect(out.previewChildren).toEqual([
            { OrderID: 'c1', Sku: 'ITEM-A', Qty: 1 },
            { OrderID: 'c1', Sku: 'ITEM-B', Qty: 3 },
        ]);
    });

    it('previews tags in dry-run mode under constrained and auto-grow', async () => {
        const mockResolveTag = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockImplementation(async (text, _w, _mode, rootID) => {
            if (text === 'Existing Tag') {
                return { ID: 'tag-1', Name: 'Existing Tag', ParentID: rootID } as unknown as MJTagEntity;
            }
            if (text === 'Deep Tag') {
                return { ID: 'tag-deep', Name: 'Deep Tag', ParentID: 'tag-1' } as unknown as MJTagEntity;
            }
            return null;
        });
        const mockGetTagByID = vi.spyOn(TagEngine.Instance, 'GetTagByID').mockImplementation((id: string) => {
            if (id === 'tag-1') return { ID: 'tag-1', Name: 'Existing Tag', ParentID: 'root-1' } as unknown as MJTagEntity;
            if (id === 'tag-deep') return { ID: 'tag-deep', Name: 'Deep Tag', ParentID: 'tag-1' } as unknown as MJTagEntity;
            if (id === 'root-1') return { ID: 'root-1', Name: 'Root', ParentID: null } as unknown as MJTagEntity;
            return undefined;
        });
        const mockConfig = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);

        const { provider, created } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: {
                tags: [
                    {
                        ref: '$.tagNames',
                        rootTagId: 'root-1',
                        growth: 'auto-grow',
                        maxDepth: 1,
                    },
                ],
            },
            result: { tagNames: ['Existing Tag', 'Deep Tag', 'Brand New Tag'] },
            record,
            contextUser: USER,
            provider,
            dryRun: true,
        });

        expect(out.dryRun).toBe(true);
        expect(out.previewTags?.length).toBe(3);
        // Existing Tag is matched at depth 1 (under root-1), so valid
        expect(out.previewTags?.[0]).toEqual({
            tagText: 'Existing Tag',
            resolvedTagID: 'tag-1',
            resolvedTagName: 'Existing Tag',
            matched: true,
            created: false,
            rootTagID: 'root-1',
            depth: 1,
            error: undefined,
        });
        // Deep Tag is matched at depth 2 (under tag-1 -> root-1), so exceeds maxDepth 1
        expect(out.previewTags?.[1].matched).toBe(true);
        expect(out.previewTags?.[1].depth).toBe(2);
        expect(out.previewTags?.[1].error).toMatch(/exceeds maxDepth/);
        // Brand New Tag is not matched, so under auto-grow it would be created at depth 1
        expect(out.previewTags?.[2]).toEqual({
            tagText: 'Brand New Tag',
            matched: false,
            created: true,
            rootTagID: 'root-1',
            depth: 1,
            error: undefined,
        });
        expect(created.length).toBe(0);
        expect(mockResolveTag).toHaveBeenCalledWith(
            'Existing Tag',
            1.0,
            'constrained',
            'root-1',
            0.8,
            USER,
            { dryRun: true }
        );

        mockResolveTag.mockRestore();
        mockGetTagByID.mockRestore();
        mockConfig.mockRestore();
    });

    it('creates TaggedItem records for resolved tags in non-dry-run mode', async () => {
        const mockResolveTag = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockResolvedValue({
            ID: 'tag-resolved-1',
            Name: 'Resolved Tag',
            ParentID: 'root-1',
        } as unknown as MJTagEntity);
        const mockGetTagByID = vi.spyOn(TagEngine.Instance, 'GetTagByID').mockReturnValue({
            ID: 'tag-resolved-1',
            Name: 'Resolved Tag',
            ParentID: 'root-1',
        } as unknown as MJTagEntity);
        const mockCreateTaggedItem = vi.spyOn(TagEngine.Instance, 'CreateTaggedItem').mockResolvedValue({
            ID: 'tagged-item-1',
            PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'tagged-item-1'),
        } as unknown as MJTaggedItemEntity);
        const mockConfig = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);

        const { provider } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: {
                tags: [
                    {
                        ref: '$.tag',
                        rootTagId: 'root-1',
                        growth: 'constrained',
                    },
                ],
            },
            result: { tag: 'Resolved Tag' },
            record,
            contextUser: USER,
            provider,
        });

        expect(mockCreateTaggedItem).toHaveBeenCalledWith(
            'tag-resolved-1',
            'ENT-1',
            'c1',
            1.0,
            USER
        );
        expect(out.createdTaggedItemIDs).toEqual(['tagged-item-1']);

        mockResolveTag.mockRestore();
        mockGetTagByID.mockRestore();
        mockCreateTaggedItem.mockRestore();
        mockConfig.mockRestore();
    });

    it('marks non-descendant tags as error in previewTags during dry-run', async () => {
        const mockResolveTag = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockResolvedValue({
            ID: 'tag-unrelated',
            Name: 'Unrelated Tag',
            ParentID: 'other-root',
        } as unknown as MJTagEntity);
        const mockGetTagByID = vi.spyOn(TagEngine.Instance, 'GetTagByID').mockImplementation((id: string) => {
            if (id === 'tag-unrelated') return { ID: 'tag-unrelated', Name: 'Unrelated Tag', ParentID: 'other-root' } as unknown as MJTagEntity;
            if (id === 'other-root') return { ID: 'other-root', Name: 'Other Root', ParentID: null } as unknown as MJTagEntity;
            return undefined;
        });
        const mockConfig = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);

        const { provider } = fakeProvider();
        const out = await applyOutputMapping({
            outputMapping: {
                tags: [
                    {
                        ref: '$.tag',
                        rootTagId: 'root-1',
                        growth: 'constrained',
                    },
                ],
            },
            result: { tag: 'Unrelated Tag' },
            record,
            contextUser: USER,
            provider,
            dryRun: true,
        });

        expect(out.previewTags?.length).toBe(1);
        expect(out.previewTags?.[0].depth).toBe(-1);
        expect(out.previewTags?.[0].error).toContain('is not a descendant of root tag');

        mockResolveTag.mockRestore();
        mockGetTagByID.mockRestore();
        mockConfig.mockRestore();
    });

    it('throws when resolved tag is not a descendant of root tag in non-dry-run mode', async () => {
        const mockResolveTag = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockResolvedValue({
            ID: 'tag-unrelated',
            Name: 'Unrelated Tag',
            ParentID: 'other-root',
        } as unknown as MJTagEntity);
        const mockGetTagByID = vi.spyOn(TagEngine.Instance, 'GetTagByID').mockImplementation((id: string) => {
            if (id === 'tag-unrelated') return { ID: 'tag-unrelated', Name: 'Unrelated Tag', ParentID: 'other-root' } as unknown as MJTagEntity;
            if (id === 'other-root') return { ID: 'other-root', Name: 'Other Root', ParentID: null } as unknown as MJTagEntity;
            return undefined;
        });
        const mockConfig = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);

        const { provider } = fakeProvider();
        await expect(applyOutputMapping({
            outputMapping: {
                tags: [
                    {
                        ref: '$.tag',
                        rootTagId: 'root-1',
                        growth: 'constrained',
                    },
                ],
            },
            result: { tag: 'Unrelated Tag' },
            record,
            contextUser: USER,
            provider,
        })).rejects.toThrow(/is not a descendant of root tag/);

        mockResolveTag.mockRestore();
        mockGetTagByID.mockRestore();
        mockConfig.mockRestore();
    });

    describe('foreign-key lookup resolution', () => {
        function fakeFKProvider(opts?: {
            fields?: Array<{ Name: string; RelatedEntity?: string; RelatedEntityID?: string }>;
            runViewHandler?: (params: { EntityName: string; ExtraFilter?: string }) => Array<Record<string, unknown>>;
            childKey?: CompositeKey;
        }) {
            const created: FakeEntity[] = [];
            const provider = {
                EntityByID: (id: string) => ({
                    ID: id,
                    Name: 'Person',
                    PrimaryKeys: [{ Name: 'ID' }],
                    FirstPrimaryKey: { Name: 'ID' },
                    Fields: opts?.fields ?? [
                        { Name: 'SeniorityLevelID', RelatedEntity: 'Seniority Levels' },
                    ],
                }),
                EntityByName: (name: string) => ({
                    ID: 'ENT-' + name,
                    Name: name,
                    PrimaryKeys: [{ Name: 'ID' }],
                    FirstPrimaryKey: { Name: 'ID' },
                }),
                GetEntityObject: async () => {
                    const e = new FakeEntity(opts?.childKey ?? CompositeKey.FromKeyValuePair('ID', 'new-created-id'));
                    created.push(e);
                    return e;
                },
                RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
                    const results = opts?.runViewHandler ? opts.runViewHandler(params) : [];
                    return { Success: true, Results: results, TotalRowCount: results.length };
                },
            } as unknown as IMetadataProvider;
            return { provider, created };
        }

        it('resolves foreign key by looking up name and writing related ID', async () => {
            const { provider, created } = fakeFKProvider({
                runViewHandler: (params) => {
                    expect(params.EntityName).toBe('Seniority Levels');
                    expect(params.ExtraFilter).toBe("[Name] = 'Director'");
                    return [{ ID: 'seniority-dir-uuid', Name: 'Director' }];
                },
            });

            const out = await applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                    fieldLookups: {
                        SeniorityLevelID: {
                            relatedEntity: 'Seniority Levels',
                            matchField: 'Name',
                            onLookupMiss: 'null',
                        },
                    },
                },
                result: { seniority: 'Director' },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
            });

            expect(out.updatedRecord).toBe(true);
            expect(created[0].sets.SeniorityLevelID).toBe('seniority-dir-uuid');
        });

        it('passes through value without lookup when already a valid UUID', async () => {
            let runViewCalled = false;
            const validUUID = 'eb506b92-343c-434d-b21f-12cfecda3d3b';
            const { provider, created } = fakeFKProvider({
                runViewHandler: () => {
                    runViewCalled = true;
                    return [];
                },
            });

            const out = await applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                },
                result: { seniority: validUUID },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
            });

            expect(runViewCalled).toBe(false);
            expect(out.updatedRecord).toBe(true);
            expect(created[0].sets.SeniorityLevelID).toBe(validUUID);
        });

        it('handles lookup miss with onLookupMiss=null by setting null', async () => {
            const { provider, created } = fakeFKProvider({
                runViewHandler: () => [], // 0 rows matched
            });

            const out = await applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                    fieldLookups: {
                        SeniorityLevelID: {
                            onLookupMiss: 'null',
                        },
                    },
                },
                result: { seniority: 'NonExistentLevel' },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
            });

            expect(out.updatedRecord).toBe(true);
            expect(created[0].sets.SeniorityLevelID).toBeNull();
        });

        it('handles lookup miss with onLookupMiss=fail by throwing an error', async () => {
            const { provider } = fakeFKProvider({
                runViewHandler: () => [], // 0 rows matched
            });

            await expect(applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                    fieldLookups: {
                        SeniorityLevelID: {
                            onLookupMiss: 'fail',
                        },
                    },
                },
                result: { seniority: 'NonExistentLevel' },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
            })).rejects.toThrow(/matched 0 rows \(OnLookupMiss=fail\)/);
        });

        it('handles lookup miss with onLookupMiss=create by creating related record', async () => {
            const { provider, created } = fakeFKProvider({
                runViewHandler: () => [], // 0 rows matched initially
                childKey: CompositeKey.FromKeyValuePair('ID', 'new-created-level-id'),
            });

            const out = await applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                    fieldLookups: {
                        SeniorityLevelID: {
                            onLookupMiss: 'create',
                        },
                    },
                },
                result: { seniority: 'Principal' },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
            });

            expect(out.updatedRecord).toBe(true);
            // First created entity is the new Seniority Level created on the miss
            expect(created[0].sets.Name).toBe('Principal');
            expect(created[0].saved).toBe(true);
            // Second created entity is the Person record being updated
            expect(created[1].sets.SeniorityLevelID).toBe('new-created-level-id');
        });

        it('returns preview ID in dry-run mode when onLookupMiss=create', async () => {
            const { provider, created } = fakeFKProvider({
                runViewHandler: () => [],
            });

            const out = await applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                    fieldLookups: {
                        SeniorityLevelID: {
                            onLookupMiss: 'create',
                        },
                    },
                },
                result: { seniority: 'Staff' },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
                dryRun: true,
            });

            expect(out.dryRun).toBe(true);
            expect(out.updatedRecord).toBe(false);
            expect(created.length).toBe(0);
            expect(out.previewFields?.SeniorityLevelID).toBe('preview-new-Seniority Levels-Staff');
        });

        it('auto-derives relatedEntity from metadata when fieldLookups omitted', async () => {
            const { provider, created } = fakeFKProvider({
                fields: [{ Name: 'SeniorityLevelID', RelatedEntity: 'Seniority Levels' }],
                runViewHandler: (params) => {
                    expect(params.EntityName).toBe('Seniority Levels');
                    return [{ ID: 'auto-derived-guid', Name: 'Manager' }];
                },
            });

            const out = await applyOutputMapping({
                outputMapping: {
                    fields: { SeniorityLevelID: '$.seniority' },
                },
                result: { seniority: 'Manager' },
                record: { EntityID: 'ENT-Person', RecordID: 'p1', Record: {} },
                contextUser: USER,
                provider,
            });

            expect(out.updatedRecord).toBe(true);
            expect(created[0].sets.SeniorityLevelID).toBe('auto-derived-guid');
        });
    });
});
