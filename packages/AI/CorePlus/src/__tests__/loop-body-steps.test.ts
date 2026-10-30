import { describe, it, expect } from 'vitest';
import {
    CompileFlowToTaskGraph,
    ConfigOf,
    ConvertTaskGraphToAgentSpec,
    ResolveLoopBodyParams,
    TaskNode,
    UnknownConditionRoots,
    ValidateTaskGraphSpec,
    type FlowCompilerPath,
    type FlowCompilerStep,
    type TaskGraphSpec,
} from '../index';

describe('ResolveLoopBodyParams', () => {
    it('preserves raw value types for single {{...}} expressions against bindings, steps, and payload', () => {
        const bindings = {
            lead: { id: 42, active: true, tags: ['enterprise', 'vip'] },
            idx: 1,
            steps: {
                calc: { Result: 84, Meta: { tier: 'gold' } },
            },
        };
        const resolved = ResolveLoopBodyParams(
            {
                leadId: '{{lead.id}}',
                isActive: '{{lead.active}}',
                tags: '{{lead.tags}}',
                stepScore: '{{steps.calc.result}}', // case-insensitive step output field lookup
                meta: '{{steps.calc.Meta}}',
                org: '{{payload.organization}}',
                apiKey: '{{context.apiKey}}',
            },
            bindings,
            {
                payload: { organization: 'Acme Corp' },
                context: { apiKey: 'sk-test-123' },
            },
        );

        expect(resolved).toEqual({
            leadId: 42,
            isActive: true,
            tags: ['enterprise', 'vip'],
            stepScore: 84,
            meta: { tier: 'gold' },
            org: 'Acme Corp',
            apiKey: 'sk-test-123',
        });
    });

    it('interpolates inline {{...}} tokens while preserving unresolved placeholders and static: literals', () => {
        const bindings = {
            item: { val: 5, label: 'alpha' },
            index: 0,
            steps: { s1: { Result: 10 } },
        };
        const resolved = ResolveLoopBodyParams(
            {
                Expression: '({{item.val}} * 2) + {{steps.s1.Result}}',
                Summary: 'Row {{index}}: {{item.label}} ({{missing.token}})',
                EscapedLiteral: 'static:{{item.val}}',
                PlainLiteral: 'USD',
            },
            bindings,
            { payload: {} },
        );

        expect(resolved).toEqual({
            Expression: '(5 * 2) + 10',
            Summary: 'Row 0: alpha ({{missing.token}})',
            EscapedLiteral: '{{item.val}}',
            PlainLiteral: 'USD',
        });
    });

    it('supports unbraced binding paths and Flow/TaskGraph payload.* / data.* / context.* mappings recursively', () => {
        const bindings = {
            city: { name: 'Chicago', coords: [41.88, -87.63] },
            index: 2,
            steps: { step_0: { NormalizedName: 'CHICAGO, IL' } },
        };
        const resolved = ResolveLoopBodyParams(
            {
                directCity: 'city',
                cityName: 'city.name',
                lat: 'city.coords[0]',
                priorNormalized: 'steps.step_0.NormalizedName',
                fromPayload: 'payload.country',
                fromData: 'data.region',
                nested: {
                    idx: 'index',
                    list: ['{{city.name}}', 'static:city.name'],
                },
            },
            bindings,
            {
                payload: { country: 'US' },
                data: { region: 'Midwest' },
            },
        );

        expect(resolved).toEqual({
            directCity: { name: 'Chicago', coords: [41.88, -87.63] },
            cityName: 'Chicago',
            lat: 41.88,
            priorNormalized: 'CHICAGO, IL',
            fromPayload: 'US',
            fromData: 'Midwest',
            nested: {
                idx: 2,
                list: ['Chicago', 'city.name'],
            },
        });
    });
});

describe('ValidateTaskGraphSpec — multi-step loop bodies (steps[])', () => {
    it('accepts valid multi-step ForEach and While nodes with step ids, conditions, and outputMappings', () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Multi-step loop validation',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe', name: 'Score leads', description: 'Compute and bucket leads', dependsOn: [] },
                    {
                        collectionPath: 'payload.leads',
                        itemVariable: 'lead',
                        indexVariable: 'i',
                        steps: [
                            {
                                id: 'baseScore',
                                name: 'Calculate Expression',
                                params: { Expression: '{{lead.employees}} * 10' },
                            },
                            {
                                id: 'bonusScore',
                                name: 'Calculate Expression',
                                condition: 'steps.baseScore.Result >= 100 && lead.active === true && i < 50',
                                params: { Expression: '{{steps.baseScore.Result}} + 25' },
                                outputMapping: '{"Result": "qualifiedScores[]"}',
                            },
                        ],
                    },
                ),
                TaskNode.While(
                    { tempId: 'wh', name: 'Converge', description: 'Step until threshold', dependsOn: ['fe'] },
                    {
                        condition: 'payload.total < 100',
                        maxIterations: 5,
                        steps: [
                            {
                                id: 'inc',
                                name: 'Calculate Expression',
                                params: { Expression: '{{payload.total}} + 20' },
                                outputMapping: '{"Result": "total"}',
                            },
                        ],
                    },
                ),
            ],
        };

        const result = ValidateTaskGraphSpec(spec);
        expect(result.Valid).toBe(true);
        expect(result.Errors).toEqual([]);
    });

    it('rejects conflicting loop body arms when both action and steps are provided', () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Conflicting loop arms',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe', name: 'Conflict', description: '', dependsOn: [] },
                    {
                        collectionPath: 'payload.items',
                        action: { name: 'Calculate Expression', params: { Expression: '1 + 1' } },
                        steps: [{ name: 'Calculate Expression', params: { Expression: '2 + 2' } }],
                    },
                ),
            ],
        };

        const result = ValidateTaskGraphSpec(spec);
        expect(result.Valid).toBe(false);
        expect(result.Errors.some((e) => e.Code === 'InvalidConfiguration' && e.Message.includes('multiple loop bodies'))).toBe(true);
    });

    it('rejects empty steps[], duplicate step ids, malformed outputMapping, and invalid step conditions', () => {
        const emptySpec: TaskGraphSpec = {
            workflowName: 'Empty steps',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe_empty', name: 'Empty', description: '', dependsOn: [] },
                    { collectionPath: 'payload.items', steps: [] },
                ),
            ],
        };
        expect(ValidateTaskGraphSpec(emptySpec).Errors.map((e) => e.Code)).toContain('InvalidConfiguration');

        const badStepsSpec: TaskGraphSpec = {
            workflowName: 'Malformed steps',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe_bad', name: 'Bad steps', description: '', dependsOn: [] },
                    {
                        collectionPath: 'payload.items',
                        steps: [
                            {
                                id: 'dup',
                                name: '',
                                params: {},
                                outputMapping: 'not-json',
                                condition: 'bogusRoot.value > 1',
                            },
                            {
                                id: 'dup',
                                name: 'Calculate Expression',
                                params: { Expression: '1 + 1' },
                                condition: 'steps.dup.Result >',
                            },
                        ],
                    },
                ),
            ],
        };
        const badResult = ValidateTaskGraphSpec(badStepsSpec);
        expect(badResult.Valid).toBe(false);
        expect(badResult.Errors.some((e) => e.Message.includes('missing a non-empty action name'))).toBe(true);
        expect(badResult.Errors.some((e) => e.Message.includes('duplicate loop step id "dup"'))).toBe(true);
        expect(badResult.Errors.some((e) => e.Message.includes('outputMapping is not valid JSON'))).toBe(true);
        expect(badResult.Errors.some((e) => e.Code === 'InvalidCondition' && e.Message.includes('"bogusRoot"'))).toBe(true);
        expect(badResult.Errors.some((e) => e.Code === 'InvalidCondition' && e.Message.includes('cannot be parsed'))).toBe(true);
    });
});

describe('Multi-step loop round-trip: TaskGraphSpec → AgentSpec (Flow) → TaskGraphSpec', () => {
    it('preserves steps[] across ConvertTaskGraphToAgentSpec and CompileFlowToTaskGraph and flags unknown step actions', () => {
        const original: TaskGraphSpec = {
            workflowName: 'Graduated multi-step loop',
            reasoning: 'Deterministic 2-step per-item enrichment',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'enrich', name: 'Enrich Items', description: 'Two-step compute', dependsOn: [] },
                    {
                        collectionPath: 'payload.numbers',
                        itemVariable: 'num',
                        steps: [
                            { id: 'double', name: 'Calculate Expression', params: { Expression: '{{num}} * 2' } },
                            {
                                id: 'plusTen',
                                name: 'Add Offset',
                                condition: 'steps.double.Result > 4',
                                params: { Expression: '{{steps.double.Result}} + 10' },
                                outputMapping: '{"Result": "outputs[]"}',
                            },
                        ],
                    },
                ),
            ],
        };

        let nextId = 0;
        const saved = ConvertTaskGraphToAgentSpec(original, {
            AgentID: 'flow-agent-1',
            ResolveAgentID: (name) => `agent-${name}`,
            ResolveActionID: (name) => (name === 'Calculate Expression' ? 'act-calc' : name === 'Add Offset' ? 'act-offset' : null),
            NextID: () => `step-${++nextId}`,
        });
        expect(saved.Success).toBe(true);
        expect(saved.Losses).toEqual([]);
        expect(saved.Spec!.Steps).toHaveLength(1);
        expect(saved.Spec!.Steps![0].StepType).toBe('ForEach');
        expect(saved.Spec!.Steps![0].LoopBodyType).toBe('Action');
        expect(saved.Spec!.Steps![0].ActionID).toBe('act-calc');

        const compilerSteps: FlowCompilerStep[] = saved.Spec!.Steps!.map((s) => ({
            ID: s.ID,
            Name: s.Name,
            Description: s.Description,
            StepType: s.StepType,
            StartingStep: s.StartingStep,
            Status: 'Active',
            ActionID: s.ActionID,
            LoopBodyType: s.LoopBodyType,
            Configuration: typeof s.Configuration === 'string' ? s.Configuration : JSON.stringify(s.Configuration),
        }));
        const compilerPaths: FlowCompilerPath[] = [];

        const recompiled = CompileFlowToTaskGraph(compilerSteps, compilerPaths, {
            WorkflowName: saved.Spec!.Name,
            ResolveAgentName: (id) => id,
            ResolveActionName: (id) => (id === 'act-calc' ? 'Calculate Expression' : id === 'act-offset' ? 'Add Offset' : null),
            ResolvePromptName: (id) => id,
        });
        expect(recompiled.Success).toBe(true);
        const feConfig = ConfigOf(recompiled.Spec!.tasks[0], 'ForEach');
        expect(feConfig?.collectionPath).toBe('payload.numbers');
        expect(feConfig?.itemVariable).toBe('num');
        expect(feConfig?.steps).toEqual(ConfigOf(original.tasks[0], 'ForEach')?.steps);

        // Verify UnknownAction loss when one of the steps inside steps[] cannot be resolved
        const withMissing = ConvertTaskGraphToAgentSpec(original, {
            AgentID: 'flow-agent-2',
            ResolveAgentID: () => null,
            ResolveActionID: (name) => (name === 'Calculate Expression' ? 'act-calc' : null),
            NextID: () => `step-${++nextId}`,
        });
        expect(withMissing.Losses).toEqual([
            expect.objectContaining({
                Kind: 'UnknownAction',
                TempId: 'enrich',
                Detail: expect.stringContaining('Add Offset'),
            }),
        ]);
    });

    it('processes pathological unclosed quotes and repeated {{ tokens in linear O(n) time without ReDoS', () => {
        const start = Date.now();
        const unclosedSingleQuotes = "'" + "\\'".repeat(25_000);
        const unclosedDoubleQuotes = '"' + '\\"'.repeat(25_000);
        expect(UnknownConditionRoots(unclosedSingleQuotes)).toEqual([]);
        expect(UnknownConditionRoots(unclosedDoubleQuotes)).toEqual([]);

        const pathologicalTemplate = '{{{{|'.repeat(10_000) + '}}';
        const resolved = ResolveLoopBodyParams(
            { text: pathologicalTemplate },
            { item: 'ok' },
            { payload: {} },
        );
        expect(typeof resolved.text).toBe('string');
        expect(Date.now() - start).toBeLessThan(500);
    });
});
