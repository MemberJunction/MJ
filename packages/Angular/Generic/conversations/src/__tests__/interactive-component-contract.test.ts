import { describe, it, expect } from 'vitest';
import type { ComponentMethodInfo } from '@memberjunction/interactive-component-types';
import { DeriveComponentContract, MergeVerbOffers } from '../lib/components/realtime/interactive-component/component-contract';
import { MakeSpec } from './helpers/interactive-component-fixtures';

function methods(info: Partial<ComponentMethodInfo>): ComponentMethodInfo {
    return { standardMethodsSupported: {}, customMethods: [], ...info };
}

describe('DeriveComponentContract: custom methods become verbs', () => {
    it('derives a verb per custom method with a parameters schema from the declared types', () => {
        const contract = DeriveComponentContract(
            MakeSpec({
                methods: methods({
                    customMethods: [
                        {
                            name: 'setRegion',
                            description: 'Filters the dashboard to one region.',
                            parameters: [
                                { name: 'region', type: 'string', description: 'The region name.' },
                                { name: 'topN', type: 'number' },
                                { name: 'includeClosed', type: 'boolean' },
                                { name: 'tags', type: 'Array<string>' },
                                { name: 'range', type: 'object' },
                            ],
                            returnType: 'void',
                        },
                    ],
                }),
            })
        );
        const verb = contract.Verbs.find((v) => v.Verb.Name === 'setRegion');
        expect(verb?.Verb.Description).toBe('Filters the dashboard to one region.');
        expect(verb?.Verb.InvokableBy).toBe('both');
        expect(verb?.Verb.ParametersSchema).toMatchObject({
            type: 'object',
            additionalProperties: false,
            required: ['region', 'topN', 'includeClosed', 'tags', 'range'],
            properties: {
                region: { type: 'string', description: 'The region name.' },
                topN: { type: 'number' },
                includeClosed: { type: 'boolean' },
                tags: { type: 'array' },
                range: { type: 'object' },
            },
        });
        expect(verb?.Binding).toEqual({ Kind: 'custom', Method: 'setRegion', ParameterNames: ['region', 'topN', 'includeClosed', 'tags', 'range'] });
    });

    it('mentions the return type in the description', () => {
        const contract = DeriveComponentContract(
            MakeSpec({ methods: methods({ customMethods: [{ name: 'getTotal', description: 'Total revenue.', parameters: [], returnType: 'number' }] }) })
        );
        expect(contract.Verbs[0].Verb.Description).toContain('Returns number.');
    });

    it('treats a trailing ?, an `undefined` type, or an "optional" description as optional', () => {
        const contract = DeriveComponentContract(
            MakeSpec({
                methods: methods({
                    customMethods: [
                        {
                            name: 'go',
                            description: 'Go.',
                            parameters: [
                                { name: 'a', type: 'string' },
                                { name: 'b?', type: 'string' },
                                { name: 'c', type: 'string | undefined' },
                                { name: 'd', type: 'string', description: 'Optional: the thing.' },
                            ],
                            returnType: 'void',
                        },
                    ],
                }),
            })
        );
        const schema = contract.Verbs[0].Verb.ParametersSchema;
        expect(schema['required']).toEqual(['a']);
        expect(Object.keys(schema['properties'] as object)).toEqual(['a', 'b', 'c', 'd']);
        expect(contract.Verbs[0].Binding).toMatchObject({ ParameterNames: ['a', 'b', 'c', 'd'] });
    });

    it('leaves a parameter of an unrepresentable type unconstrained but documented', () => {
        const contract = DeriveComponentContract(
            MakeSpec({ methods: methods({ customMethods: [{ name: 'apply', description: 'x', parameters: [{ name: 'spec', type: 'FilterSpec | null' }], returnType: 'void' }] }) })
        );
        const properties = contract.Verbs[0].Verb.ParametersSchema['properties'] as Record<string, Record<string, unknown>>;
        expect(properties['spec']['type']).toBeUndefined();
        expect(properties['spec']['description']).toContain('FilterSpec | null');
    });

    it('skips (and reports) a method whose required parameter is a function an agent cannot pass', () => {
        const contract = DeriveComponentContract(
            MakeSpec({ methods: methods({ customMethods: [{ name: 'onTick', description: 'x', parameters: [{ name: 'cb', type: 'function' }], returnType: 'void' }] }) })
        );
        expect(contract.Verbs).toEqual([]);
        expect(contract.Skipped).toEqual([{ Name: 'onTick', Reason: expect.stringContaining('function') }]);
    });

    it('drops an OPTIONAL function parameter and keeps the method', () => {
        const contract = DeriveComponentContract(
            MakeSpec({ methods: methods({ customMethods: [{ name: 'load', description: 'x', parameters: [{ name: 'id', type: 'string' }, { name: 'done?', type: 'function' }], returnType: 'void' }] }) })
        );
        expect(Object.keys(contract.Verbs[0].Verb.ParametersSchema['properties'] as object)).toEqual(['id']);
    });

    it('renames a custom method that collides with a channel verb instead of shadowing it', () => {
        const contract = DeriveComponentContract(
            MakeSpec({
                methods: methods({
                    standardMethodsSupported: { refresh: true },
                    customMethods: [
                        { name: 'close', description: 'Closes a panel.', parameters: [], returnType: 'void' },
                        { name: 'Refresh', description: 'Own refresh.', parameters: [], returnType: 'void' },
                    ],
                }),
            })
        );
        const names = contract.Verbs.map((v) => v.Verb.Name);
        expect(names).toEqual(['refresh', 'custom_close', 'custom_Refresh']);
        expect(contract.Verbs.find((v) => v.Verb.Name === 'custom_close')?.Binding).toMatchObject({ Kind: 'custom', Method: 'close' });
    });

    it('skips a custom method with no name', () => {
        const contract = DeriveComponentContract(
            MakeSpec({ methods: methods({ customMethods: [{ name: ' ', description: 'x', parameters: [], returnType: 'void' }] }) })
        );
        expect(contract.Verbs).toEqual([]);
        expect(contract.Skipped).toHaveLength(1);
    });

    it('a spec with no methods has no verbs', () => {
        expect(DeriveComponentContract(MakeSpec()).Verbs).toEqual([]);
    });
});

describe('DeriveComponentContract: standard methods', () => {
    it('exposes only the standard methods the spec says it supports', () => {
        const contract = DeriveComponentContract(
            MakeSpec({ methods: methods({ standardMethodsSupported: { refresh: true, print: true, isDirty: true, validate: true, reset: true } }) })
        );
        expect(contract.Verbs.map((v) => v.Verb.Name)).toEqual(['refresh', 'validate', 'is_dirty', 'reset', 'print']);
        expect(contract.Verbs.every((v) => v.Binding.Kind === 'standard')).toBe(true);
    });

    it('scroll_to and focus carry their parameters', () => {
        const contract = DeriveComponentContract(MakeSpec({ methods: methods({ standardMethodsSupported: { scrollTo: true, focus: true } }) }));
        const scroll = contract.Verbs.find((v) => v.Verb.Name === 'scroll_to');
        const focus = contract.Verbs.find((v) => v.Verb.Name === 'focus');
        expect(Object.keys(scroll?.Verb.ParametersSchema['properties'] as object)).toEqual(['target', 'top', 'left']);
        expect(Object.keys(focus?.Verb.ParametersSchema['properties'] as object)).toEqual(['target']);
    });

    it('getCurrentDataState becomes the data noun AND an on-demand get_data_state verb', () => {
        const supported = DeriveComponentContract(MakeSpec({ methods: methods({ standardMethodsSupported: { getCurrentDataState: true } }) }));
        expect(supported.SupportsDataState).toBe(true);
        expect(supported.Verbs.map((v) => v.Verb.Name)).toEqual(['get_data_state']);

        const unsupported = DeriveComponentContract(MakeSpec({ methods: methods({ standardMethodsSupported: { refresh: true } }) }));
        expect(unsupported.SupportsDataState).toBe(false);
    });

    it('verbs that take no parameters reject extras', () => {
        const contract = DeriveComponentContract(MakeSpec({ methods: methods({ standardMethodsSupported: { refresh: true } }) }));
        expect(contract.Verbs[0].Verb.ParametersSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    });
});

describe('DeriveComponentContract: events and inputs', () => {
    it('spec events become channel events with a payload schema from their parameters', () => {
        const contract = DeriveComponentContract(
            MakeSpec({
                events: [
                    {
                        name: 'rowSelected',
                        description: 'The user selected a row.',
                        parameters: [
                            { name: 'rowId', description: 'The row id.', type: 'string' },
                            { name: 'index', description: 'Position.', type: 'number' },
                        ],
                    },
                    { name: 'closed', description: 'No parameters.' },
                ],
            })
        );
        expect(contract.Events).toEqual([
            {
                Name: 'rowSelected',
                Description: 'The user selected a row.',
                PayloadSchema: { type: 'object', properties: { rowId: { type: 'string', description: 'The row id.' }, index: { type: 'number', description: 'Position.' } } },
            },
            { Name: 'closed', Description: 'No parameters.', PayloadSchema: { type: 'object', properties: {} } },
        ]);
    });

    it('spec properties become the schema of the opening inputs; callbacks are left out and required ones are required', () => {
        const contract = DeriveComponentContract(
            MakeSpec({
                properties: [
                    { name: 'year', description: 'Fiscal year.', type: 'number', required: true },
                    { name: 'mode', description: 'View mode.', type: 'string', required: false, possibleValues: ['table', 'chart'] },
                    { name: 'onPick', description: 'Callback.', type: 'function', required: false },
                ],
            })
        );
        expect(contract.InputsSchema).toEqual({
            type: 'object',
            properties: {
                year: { type: 'number', description: 'Fiscal year.' },
                mode: { type: 'string', description: 'View mode.', enum: ['table', 'chart'] },
            },
            required: ['year'],
        });
    });

    it('a spec with neither has empty events and an empty inputs schema', () => {
        const contract = DeriveComponentContract(MakeSpec());
        expect(contract.Events).toEqual([]);
        expect(contract.InputsSchema).toEqual({ type: 'object', properties: {} });
    });
});

describe('MergeVerbOffers', () => {
    const verb = (props: Record<string, unknown>, required?: string[]) => ({
        Name: 'setFilter',
        Description: 'Filters.',
        ParametersSchema: { type: 'object', properties: props as never, ...(required ? { required } : {}) },
        InvokableBy: 'both' as const,
    });

    it('a verb offered by one component is returned unchanged', () => {
        const only = verb({ a: { type: 'string' } }, ['a']);
        expect(MergeVerbOffers([{ Component: 'A', Verb: only }])).toEqual(only);
    });

    it('merges the parameters of several components and requires none, naming each signature', () => {
        const merged = MergeVerbOffers([
            { Component: 'Revenue', Verb: verb({ region: { type: 'string' } }, ['region']) },
            { Component: 'Pipeline', Verb: verb({ stage: { type: 'string' }, owner: { type: 'string' } }) },
        ]);
        expect(Object.keys(merged.ParametersSchema['properties'] as object)).toEqual(['region', 'stage', 'owner']);
        expect(merged.ParametersSchema['required']).toBeUndefined();
        expect(merged.Description).toContain('Revenue: region');
        expect(merged.Description).toContain('Pipeline: stage, owner');
    });

    it('the first component wins when two declare the same parameter differently', () => {
        const merged = MergeVerbOffers([
            { Component: 'A', Verb: verb({ x: { type: 'string' } }) },
            { Component: 'B', Verb: verb({ x: { type: 'number' } }) },
        ]);
        expect((merged.ParametersSchema['properties'] as Record<string, { type: string }>)['x'].type).toBe('string');
    });
});
