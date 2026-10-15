import { describe, it, expect, vi } from 'vitest';
import { UserInfo, type RunViewResult } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { ValidateOutputItems, ValidateOutputValue } from '../validation/constraint-validator';
import { LookupConstraintValues } from '../validation/lookup-values';
import { RenderConstraintBlock, ResolveConstraint, type DataFeatureOutput } from '../spec/data-feature-spec';
import type { ResolvedConstraint, ValueConstraint } from '../spec/value-constraint';

const seniority: DataFeatureOutput = {
    Name: 'SeniorityLevel', Ref: '$.SeniorityLevel',
    Constraint: { Type: 'lookup', Entity: 'Seniority Levels', MatchField: 'Name', DisplayFields: ['Description'], OnViolation: 'fail' },
    Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID', LookupMatchField: 'Name' },
};
const functions: DataFeatureOutput = {
    Name: 'JobFunctions', Ref: '$.Functions',
    Constraint: { Type: 'lookup', Entity: 'Job Functions', MatchField: 'ID', DisplayFields: ['Name', 'Description'], ItemRef: '$.JobFunctionID', OnViolation: 'fail' },
    Target: { Mode: 'child', EntityName: 'Person Job Functions', ParentField: 'PersonID', Map: { JobFunctionID: '$.JobFunctionID' } },
};
/** The output's resolved constraint; these outputs all declare one. */
const resolvedOf = (o: DataFeatureOutput): ResolvedConstraint => {
    const r = ResolveConstraint(o);
    if (!r) throw new Error(`${o.Name} has no constraint`);
    return r;
};
const constraintOf = (o: DataFeatureOutput) => {
    if (!o.Constraint) throw new Error(`${o.Name} has no constraint`);
    return o.Constraint;
};
const resolvedSeniority = LookupConstraintValues.Apply(resolvedOf(seniority), [
    { Match: 'Director', Display: 'Department or practice leader' }, { Match: 'Manager', Display: 'Frontline people manager' },
]);
const resolvedFunctions = LookupConstraintValues.Apply(resolvedOf(functions), [
    { Match: '7E010001-A101-4B01-8C01-000000000007', Display: 'Operations — Business operations' },
]);

describe('lookup constraints check existence', () => {
    it('rejects a value that is not a row', () => {
        const r = ValidateOutputValue('Grand Poobah', constraintOf(seniority), { resolved: resolvedSeniority });
        expect(r.valid).toBe(false);
        expect(r.violationMessage).toContain('Grand Poobah');
    });
    it('accepts a row value in any case and returns its canonical form', () => {
        const r = ValidateOutputValue('director', constraintOf(seniority), { resolved: resolvedSeniority });
        expect(r).toMatchObject({ valid: true, value: 'Director' });
    });
    it('checks every item of an array output by its ItemRef', () => {
        const bad = ValidateOutputItems([{ JobFunctionID: '7e010001-a101-4b01-8c01-000000000007' }, { JobFunctionID: '00000000-0000-0000-0000-00000000C0DE' }],
            constraintOf(functions), { resolved: resolvedFunctions });
        expect(bad.valid).toBe(false);
        expect(bad.violationMessage).toContain('00000000-0000-0000-0000-00000000C0DE');
        const good = ValidateOutputItems([{ JobFunctionID: '7e010001-a101-4b01-8c01-000000000007' }], constraintOf(functions), { resolved: resolvedFunctions });
        expect(good.valid).toBe(true);
        expect(good.value).toEqual([{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007' }]);
    });
    it('reports no coercion when every item already holds its canonical value', () => {
        const same = ValidateOutputItems([{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007' }], constraintOf(functions), { resolved: resolvedFunctions });
        expect(same).toMatchObject({ valid: true, coerced: false });
    });
    it('drops the items a coerce-to-other lookup cannot place, as null does, and keeps the rest', () => {
        const coerce: ValueConstraint = { ...constraintOf(functions), OnViolation: 'coerce-to-other' };
        const r = ValidateOutputItems([{ JobFunctionID: '7e010001-a101-4b01-8c01-000000000007' }, { JobFunctionID: 'not-a-row' }],
            coerce, { resolved: { ...resolvedFunctions, OnViolation: 'coerce-to-other' } });
        expect(r).toMatchObject({ valid: true, violationPolicyApplied: 'coerce-to-other', coerced: true });
        expect(r.value).toEqual([{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007' }]);
        expect(r.violationMessage).toContain('not-a-row');
    });
});

describe('the constraint block renders the taxonomy from rows', () => {
    it('lists each allowed row value with its display text', () => {
        const block = RenderConstraintBlock([seniority, functions], new Map([['SeniorityLevel', resolvedSeniority], ['JobFunctions', resolvedFunctions]]));
        expect(block).toContain('"Director" — Department or practice leader');
        expect(block).toContain('For each item, $.JobFunctionID MUST be exactly one of');
        expect(block).toContain('"7E010001-A101-4B01-8C01-000000000007" — Operations — Business operations');
    });
});

/** A provider whose views answer `rows`; the spy records the view parameters. */
const providerWithRows = (rows: Array<Record<string, unknown>>) => {
    const provider = new EntitiesOnlyProvider([]);
    const result: RunViewResult<Record<string, unknown>> = { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    const runView = vi.spyOn(provider, 'RunView').mockResolvedValue(result);
    return { provider, runView };
};

describe('LookupConstraintValues.Load', () => {
    it('reads the match and display columns, skips rows without a match value, and refuses unsafe field names', async () => {
        const { provider, runView } = providerWithRows([
            { Name: 'Director', Description: 'Department leader' }, { Name: null, Description: 'orphan' }, { Name: 'Manager', Description: null },
        ]);
        const user = new UserInfo();
        const rows = await LookupConstraintValues.Load(resolvedOf(seniority), provider, user);
        expect(rows).toEqual([{ Match: 'Director', Display: 'Department leader' }, { Match: 'Manager', Display: null }]);
        expect(runView.mock.calls[0][0]).toMatchObject({ EntityName: 'Seniority Levels', Fields: ['Name', 'Description'], ResultType: 'simple' });
        const unsafe: DataFeatureOutput = { ...seniority, Constraint: { Type: 'lookup', Entity: 'X', MatchField: 'Name; DROP TABLE x', OnViolation: 'fail' } };
        await expect(LookupConstraintValues.Load(resolvedOf(unsafe), provider, user)).rejects.toThrow(/Invalid field name/);
    });
    it('reads the entity and match field the constraint resolves to: the target field\'s foreign key and its LookupMatchField', async () => {
        const { provider, runView } = providerWithRows([{ Code: 'DIR' }]);
        const byField: DataFeatureOutput = {
            Name: 'SeniorityLevel', Ref: '$.SeniorityLevel', Constraint: { Type: 'lookup', OnViolation: 'fail' },
            Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID', LookupMatchField: 'Code' },
        };
        const resolved = ResolveConstraint(byField, { Name: 'SeniorityLevelID', RelatedEntity: 'Seniority Levels' });
        if (!resolved) throw new Error('expected a resolved constraint');
        expect(await LookupConstraintValues.Load(resolved, provider, new UserInfo())).toEqual([{ Match: 'DIR', Display: null }]);
        expect(runView.mock.calls[0][0]).toMatchObject({ EntityName: 'Seniority Levels', Fields: ['Code'] });
    });
    it('returns the rows in one order whatever order the provider returns them in, so the block text and hash are stable', async () => {
        const rows = [{ Name: 'Manager', Description: 'Frontline' }, { Name: 'Director', Description: 'Department' }, { Name: 'VP', Description: null }];
        const first = providerWithRows(rows);
        const second = providerWithRows([...rows].reverse());
        const a = await LookupConstraintValues.Load(resolvedOf(seniority), first.provider, new UserInfo());
        const b = await LookupConstraintValues.Load(resolvedOf(seniority), second.provider, new UserInfo());
        expect(a).toEqual(b);
        expect(a.map((r) => r.Match)).toEqual(['Director', 'Manager', 'VP']);
        expect(first.runView.mock.calls[0][0]).toMatchObject({ OrderBy: 'Name' });
        const block = (r: typeof a) => RenderConstraintBlock([seniority], new Map([['SeniorityLevel', LookupConstraintValues.Apply(resolvedOf(seniority), r)]]));
        expect(block(a)).toBe(block(b));
    });
});
