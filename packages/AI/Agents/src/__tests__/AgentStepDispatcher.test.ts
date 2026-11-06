import { describe, it, expect } from 'vitest';
import { AgentStepDispatcher } from '../AgentStepDispatcher';
import { BaseAgentNextStep } from '@memberjunction/ai-core-plus';

describe('AgentStepDispatcher', () => {
    describe('BuildActionInvocationMessage & BuildActionResultsMessage', () => {
        it('should format single and parallel action invocations and results markdown', () => {
            const dispatcher = new AgentStepDispatcher();
            const singleMsg = dispatcher.BuildActionInvocationMessage(
                [{ name: 'SearchAccounts', params: { query: 'Acme' } }],
                (a) => Object.entries(a.params)
            );
            expect(singleMsg).toContain('[You invoked the **SearchAccounts** action with parameters:');
            expect(singleMsg).toContain('• **query**: `Acme`');

            const resultsMsg = dispatcher.BuildActionResultsMessage([
                {
                    actionName: 'SearchAccounts',
                    success: true,
                    resultCode: 'SUCCESS',
                    message: 'Found 1 account',
                    params: [{ Name: 'Count', Value: 1, Type: 'Output' }],
                },
            ]);
            expect(resultsMsg).toContain('Action results:');
            expect(resultsMsg).toContain('## SearchAccounts ✓');
            expect(resultsMsg).toContain('• `Count`: `1`');
        });
    });

    describe('ApplySubAgentInputMapping & ApplySubAgentOutputMapping', () => {
        it('should map nested paths between parent and sub-agent payloads', () => {
            const dispatcher = new AgentStepDispatcher();
            const subInput = dispatcher.ApplySubAgentInputMapping(
                { customer: { id: 'cust-42', region: 'NA' } },
                JSON.stringify({ 'customer.id': 'target.customerId' })
            );
            expect(subInput).toEqual({ target: { customerId: 'cust-42' } });

            const parentUpdate = dispatcher.ApplySubAgentOutputMapping<{ summary: { score: number } }>(
                { analysis: { riskScore: 88 } },
                {},
                JSON.stringify({ 'analysis.riskScore': 'summary.score' })
            );
            expect(parentUpdate).toEqual({
                updateElements: { summary: { score: 88 } },
            });
        });
    });

    describe('GetCollectionFromPayload, CreateBatches, & ApplyForEachResultsSequentially', () => {
        it('should extract collections, batch items with original indices, and fold results sequentially', () => {
            const dispatcher = new AgentStepDispatcher();
            const staticItems = dispatcher.GetCollectionFromPayload({}, 'static:["alpha","beta","gamma"]');
            expect(staticItems).toEqual(['alpha', 'beta', 'gamma']);

            const payloadItems = dispatcher.GetCollectionFromPayload(
                { records: [{ id: 1 }, { id: 2 }, { id: 3 }] },
                'payload.records'
            );
            expect(payloadItems).toHaveLength(3);

            const batches = dispatcher.CreateBatches(['a', 'b', 'c'], 2);
            expect(batches).toEqual([
                [
                    { item: 'a', index: 0 },
                    { item: 'b', index: 1 },
                ],
                [{ item: 'c', index: 2 }],
            ]);

            const step0: BaseAgentNextStep = { step: 'Actions', terminate: false };
            const step1: BaseAgentNextStep = { step: 'Actions', terminate: false };
            const folded = dispatcher.ApplyForEachResultsSequentially(
                [
                    {
                        index: 0,
                        result: step0,
                        appliedFolds: [{ output: { itemResult: 'r1' }, mapping: '{"itemResult":"items[]"}' }],
                    },
                    {
                        index: 1,
                        result: step1,
                        appliedFolds: [{ output: { itemResult: 'r2' }, mapping: '{"itemResult":"items[]"}' }],
                    },
                ],
                { items: [] },
                true
            );
            expect(folded.errors).toHaveLength(0);
            expect(folded.results).toHaveLength(2);
            expect(folded.finalPayload).toEqual({ items: ['r1', 'r2'] });
        });
    });

    describe('ResolveTemplates & ResolveInlineTemplateExpressions', () => {
        it('should interpolate loop item variables, nested properties, and inline expressions', () => {
            const dispatcher = new AgentStepDispatcher();
            const resolved = dispatcher.ResolveTemplates(
                {
                    exactItem: '{{cityInfo}}',
                    cityName: '{{cityInfo.city}}',
                    headline: 'Office in {{cityInfo.city}}, {{cityInfo.country}} (#{{index}})',
                    tags: ['{{cityInfo.country}}', 'literal'],
                },
                {
                    item: { city: 'Tokyo', country: 'Japan' },
                    index: 0,
                },
                'cityInfo'
            );

            expect(resolved).toEqual({
                exactItem: { city: 'Tokyo', country: 'Japan' },
                cityName: 'Tokyo',
                headline: 'Office in Tokyo, Japan (#0)',
                tags: ['Japan', 'literal'],
            });
        });

        it('should evaluate pathological unclosed template strings in linear time and reject prototype-polluting keys', () => {
            const dispatcher = new AgentStepDispatcher();
            const pathological = `{{{{${'\t'.repeat(50_000)}`;
            const startMs = Date.now();
            const out = dispatcher.ResolveInlineTemplateExpressions(pathological, { item: 'x', index: 0 }, 'item');
            expect(out).toBe(pathological);
            expect(Date.now() - startMs).toBeLessThan(100);

            const pollutedIn = dispatcher.ApplySubAgentInputMapping(
                { secret: 'polluted' },
                JSON.stringify({ secret: '__proto__.pollutedTestKey' })
            );
            expect(pollutedIn).toBeNull();
            expect(({} as Record<string, unknown>).pollutedTestKey).toBeUndefined();
        });
    });

    describe('BaseAgent subclass protected override hooks', () => {
        it('should route internal loop and sub-agent methods through subclass overrides of formatActionResultsAsMarkdown, cloneSubAgentPayload, and getValueFromPath', async () => {
            const { BaseAgent } = await import('../base-agent');

            const formatCalls: number[] = [];
            const cloneCalls: unknown[] = [];
            const pathCalls: string[] = [];

            class CustomStepHooksAgent extends BaseAgent {
                protected override formatActionResultsAsMarkdown(
                    actionSummaries: Parameters<BaseAgent['formatActionResultsAsMarkdown']>[0]
                ): string {
                    formatCalls.push(actionSummaries.length);
                    return `[custom-markdown:${actionSummaries.map((s) => s.actionName).join(',')}]`;
                }

                protected override cloneSubAgentPayload<T>(payload: T): T {
                    cloneCalls.push(payload);
                    return super.cloneSubAgentPayload(payload);
                }

                protected override getValueFromPath(obj: unknown, path: string): unknown {
                    pathCalls.push(path);
                    return super.getValueFromPath(obj, path);
                }
            }

            const agent = new CustomStepHooksAgent();

            // 1. formatLoopResultsAsMarkdown -> formatActionResultsAsMarkdown override
            const loopStep: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                priorStepResult: [
                    {
                        actionName: 'LookupOrder',
                        success: true,
                        resultCode: 'SUCCESS',
                        message: 'ok',
                        params: [],
                    },
                ],
            };
            const loopMarkdown = agent['formatLoopResultsAsMarkdown']([loopStep], []);
            expect(formatCalls).toEqual([1]);
            expect(loopMarkdown).toContain('[custom-markdown:LookupOrder]');

            // 2. applyLoopOutputFold & applyForEachResultsSequentially -> cloneSubAgentPayload override
            const foldedDirect = agent['applyLoopOutputFold'](
                { items: ['a'] },
                { next: 'b' },
                JSON.stringify({ next: 'items[]' })
            );
            expect(foldedDirect).toEqual({ items: ['a', 'b'] });
            expect(cloneCalls).toHaveLength(1);

            const sequential = agent['applyForEachResultsSequentially'](
                [
                    {
                        index: 0,
                        result: loopStep,
                        appliedFolds: [{ output: { next: 'c' }, mapping: JSON.stringify({ next: 'items[]' }) }],
                    },
                ],
                { items: ['x'] },
                false
            );
            expect(sequential.finalPayload).toEqual({ items: ['x', 'c'] });
            expect(cloneCalls).toHaveLength(2);

            // 3. applySubAgentInputMapping, applySubAgentOutputMapping, prepareRelatedSubAgentContextMessage, getCollectionFromPayload -> getValueFromPath override
            const subIn = agent['applySubAgentInputMapping'](
                { account: { id: 'acc-1' } },
                JSON.stringify({ 'account.id': 'target.accountId' })
            );
            expect(subIn).toEqual({ target: { accountId: 'acc-1' } });

            const subOut = agent['applySubAgentOutputMapping']<{ out: { score: number } }>(
                { metrics: { score: 42 } },
                {},
                JSON.stringify({ 'metrics.score': 'out.score' })
            );
            expect(subOut).toEqual({ updateElements: { out: { score: 42 } } });

            const ctxMsg = agent['prepareRelatedSubAgentContextMessage'](
                { profile: { region: 'EU' } },
                ['profile.region']
            );
            expect(ctxMsg?.content).toContain('EU');

            const collection = agent['getCollectionFromPayload'](
                { rows: [{ id: 1 }, { id: 2 }] },
                'payload.rows'
            );
            expect(collection).toHaveLength(2);

            expect(pathCalls).toEqual(['account.id', 'metrics.score', 'profile.region', 'rows']);
        });
    });
});
