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
    });
});
