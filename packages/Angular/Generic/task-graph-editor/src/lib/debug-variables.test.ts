import { describe, it, expect } from 'vitest';
import { BuildVariableScopes, DecodePayload } from './debug-variables';

describe('DecodePayload', () => {
    it('parses JSON and leaves plain text alone', () => {
        expect(DecodePayload('{"a":1}')).toEqual({ a: 1 });
        expect(DecodePayload('not json')).toBe('not json');
        expect(DecodePayload(null)).toBeUndefined();
    });
});

describe('BuildVariableScopes', () => {
    it('names Input / Output / Invocation like VS Code scopes', () => {
        const scopes = BuildVariableScopes({
            input: { ticker: 'NVDA' },
            output: { stockPrice: 224.35 },
            invocation: { data: { approved: true }, context: { tier: 'gold' } },
        });
        expect(scopes.map((s) => s.Name)).toEqual(['Input', 'Output', 'Invocation']);
        expect(scopes[0].Variables[0]).toMatchObject({ Name: 'ticker', Preview: '"NVDA"', Kind: 'string' });
        expect(scopes[1].Variables[0]).toMatchObject({ Name: 'stockPrice', Preview: '224.35', Kind: 'number' });
        expect(scopes[2].Variables.map((v) => v.Name)).toEqual(['data', 'context']);
    });

    it('omits empty scopes rather than showing a blank VARIABLES pane', () => {
        expect(BuildVariableScopes({})).toEqual([]);
        expect(BuildVariableScopes({ input: null, output: undefined })).toEqual([]);
    });
});
