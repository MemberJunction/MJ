import { describe, it, expect } from 'vitest';
import { FieldRulesEvaluator } from '../fieldRules/FieldRulesEvaluator';
import { FieldTransformEngine } from '../fieldRules/FieldTransformEngine';
import type { FieldRuleSet, ResolvedLookup } from '../fieldRules/rules';

describe('FieldRulesEvaluator.ComputeChanges', () => {
    const run = async (record: Record<string, unknown>, ruleSet: FieldRuleSet, resolver?: (l: ResolvedLookup) => Promise<unknown>) =>
        new FieldRulesEvaluator({ LookupResolver: resolver }).ComputeChanges(record, ruleSet);

    describe('value sources', () => {
        it('static: sets a literal value and flags the change', async () => {
            const [c] = await run({ Status: 'Active' }, { Rules: [{ TargetField: 'Status', Source: { Kind: 'static', Value: 'Inactive' } }] });
            expect(c).toMatchObject({ Field: 'Status', OldValue: 'Active', NewValue: 'Inactive', Changed: true, Applied: true });
        });

        it('static: equal value is Applied but not Changed', async () => {
            const [c] = await run({ Status: 'Active' }, { Rules: [{ TargetField: 'Status', Source: { Kind: 'static', Value: 'Active' } }] });
            expect(c).toMatchObject({ Changed: false, Applied: true });
        });

        it('field: copies another field', async () => {
            const [c] = await run({ A: 'x', B: 'y' }, { Rules: [{ TargetField: 'A', Source: { Kind: 'field', Field: 'B' } }] });
            expect(c.NewValue).toBe('y');
        });

        it('formula: computes from record fields', async () => {
            const [c] = await run(
                { FirstName: 'Ada', LastName: 'Lovelace', FullName: '' },
                { Rules: [{ TargetField: 'FullName', Source: { Kind: 'formula', Expression: "fields.FirstName + ' ' + fields.LastName" } }] },
            );
            expect(c.NewValue).toBe('Ada Lovelace');
        });

        it('lookup: resolves via the injected resolver and passes through the matched value', async () => {
            const seen: ResolvedLookup[] = [];
            const [c] = await run(
                { CompanyName: 'Acme', CompanyID: null },
                { Rules: [{ TargetField: 'CompanyID', Source: { Kind: 'lookup', Lookup: { Entity: 'Accounts', MatchField: 'Name', MatchValue: { Kind: 'field', Field: 'CompanyName' }, ReturnField: 'ID' } } }] },
                async (l) => { seen.push(l); return 'acct-123'; },
            );
            expect(c.NewValue).toBe('acct-123');
            expect(seen[0]).toEqual({ Entity: 'Accounts', MatchField: 'Name', MatchValue: 'Acme', ReturnField: 'ID' });
        });

        it('lookup: falls back to Default when the resolver returns undefined', async () => {
            const [c] = await run(
                { Name: 'x', RegionID: null },
                { Rules: [{ TargetField: 'RegionID', Source: { Kind: 'lookup', Lookup: { Entity: 'Regions', MatchField: 'Name', MatchValue: { Kind: 'static', Value: 'Nowhere' }, ReturnField: 'ID', Default: 'unknown' } } }] },
                async () => undefined,
            );
            expect(c.NewValue).toBe('unknown');
        });

        it('lookup: errors clearly when no resolver is provided', async () => {
            const [c] = await run({ X: null }, { Rules: [{ TargetField: 'X', Source: { Kind: 'lookup', Lookup: { Entity: 'E', MatchField: 'F', MatchValue: { Kind: 'static', Value: 1 }, ReturnField: 'ID' } } }] });
            expect(c.Applied).toBe(false);
            expect(c.Error).toMatch(/no LookupResolver/);
        });
    });

    describe('conditions', () => {
        it('applies the rule only when the condition is true', async () => {
            const ruleSet: FieldRuleSet = { Rules: [{ TargetField: 'Tier', Source: { Kind: 'static', Value: 'Gold' }, Condition: 'Revenue > 1000' }] };
            const [hot] = await run({ Revenue: 5000, Tier: 'Bronze' }, ruleSet);
            const [cold] = await run({ Revenue: 10, Tier: 'Bronze' }, ruleSet);
            expect(hot).toMatchObject({ Applied: true, NewValue: 'Gold' });
            expect(cold).toMatchObject({ Applied: false, SkipReason: expect.stringMatching(/condition/) });
        });

        it('reports a condition expression error without throwing', async () => {
            const [c] = await run({ X: 1 }, { Rules: [{ TargetField: 'X', Source: { Kind: 'static', Value: 2 }, Condition: 'this is not valid ===' }] });
            expect(c.Applied).toBe(false);
            expect(c.Error).toMatch(/condition/);
        });
    });

    describe('transform pipeline on the computed value', () => {
        it('chains transforms (formula → coerce → custom)', async () => {
            const [c] = await run(
                { Price: '19.99', Total: 0 },
                { Rules: [{
                    TargetField: 'Total',
                    Source: { Kind: 'field', Field: 'Price' },
                    Transforms: [
                        { Type: 'coerce', Config: { TargetType: 'number' } },
                        { Type: 'custom', Config: { Expression: 'value * 2' } },
                    ],
                }] },
            );
            expect(c.NewValue).toBeCloseTo(39.98);
        });

        it('OnError=Null nulls the field when a transform throws', async () => {
            const [c] = await run(
                { Amount: 'not-a-number', Out: 'x' },
                { Rules: [{ TargetField: 'Out', Source: { Kind: 'field', Field: 'Amount' }, Transforms: [{ Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Null' }] }] },
            );
            expect(c.NewValue).toBeNull();
        });
    });

    it('computes ALL rules independently (multi-rule preview)', async () => {
        const changes = await run(
            { A: 1, B: 2, C: 3 },
            { Rules: [
                { TargetField: 'A', Source: { Kind: 'static', Value: 10 } },
                { TargetField: 'B', Source: { Kind: 'static', Value: 2 } }, // unchanged
                { TargetField: 'C', Source: { Kind: 'static', Value: 30 }, Condition: 'A == 1' },
            ] },
        );
        expect(changes.map((c) => [c.Field, c.Changed, c.Applied])).toEqual([
            ['A', true, true],
            ['B', false, true],
            ['C', true, true],
        ]);
    });
});

describe('FieldTransformEngine (each transform type)', () => {
    const e = new FieldTransformEngine();
    const step = (value: unknown, ...steps: Parameters<FieldTransformEngine['ExecutePipeline']>[2]) => e.ExecutePipeline(value, {}, steps).Value;

    it('regex / split / substring', () => {
        expect(step('a-b-c', { Type: 'regex', Config: { Pattern: '-', Replacement: '_', Flags: 'g' } })).toBe('a_b_c');
        expect(step('a,b,c', { Type: 'split', Config: { Delimiter: ',', Index: 1 } })).toBe('b');
        expect(step('hello', { Type: 'substring', Config: { Start: 1, Length: 3 } })).toBe('ell');
    });

    it('combine pulls from fields', () => {
        expect(e.ExecutePipeline(null, { A: 'x', B: 'y' }, [{ Type: 'combine', Config: { SourceFields: ['A', 'B'], Separator: '-' } }]).Value).toBe('x-y');
    });

    it('lookup (in-memory map, case-insensitive) + default', () => {
        expect(step('ACTIVE', { Type: 'lookup', Config: { Map: { active: 1 }, Default: 0 } })).toBe(1);
        expect(step('other', { Type: 'lookup', Config: { Map: { active: 1 }, Default: 0 } })).toBe(0);
    });

    it('coerce number/boolean/string', () => {
        expect(step('42', { Type: 'coerce', Config: { TargetType: 'number' } })).toBe(42);
        expect(step('yes', { Type: 'coerce', Config: { TargetType: 'boolean' } })).toBe(true);
        expect(step(7, { Type: 'coerce', Config: { TargetType: 'string' } })).toBe('7');
    });

    it('OnError=Skip drops the field; OnError=Fail propagates', () => {
        expect(e.ExecutePipeline('x', {}, [{ Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Skip' }]).Skipped).toBe(true);
        expect(() => e.ExecutePipeline('x', {}, [{ Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Fail' }])).toThrow();
    });

    it('a malformed custom expression compiles once and is reported', () => {
        expect(() => e.ExecutePipeline('x', {}, [{ Type: 'custom', Config: { Expression: ')(' }, OnError: 'Fail' }])).toThrow();
    });
});
