import { describe, it, expect, vi } from 'vitest';
import { OutputConstraintResolver, type LookupRowsLoader } from '../validation/output-constraint-resolver';
import type { DataFeatureOutput, EntityMetadataStub } from '../spec/data-feature-spec';
import type { LookupValueRow } from '../validation/lookup-values';

const people: EntityMetadataStub = {
    Name: 'People',
    Fields: [
        { Name: 'Status', TSType: 'string', EntityFieldValues: [{ Value: 'Active' }, { Value: 'Inactive' }] },
        { Name: 'SeniorityLevelID', TSType: 'string', RelatedEntity: 'Seniority Levels' },
    ],
};
const status: DataFeatureOutput = {
    Name: 'Status', Ref: '$.Status', Constraint: { Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' },
    Target: { Mode: 'field', EntityFieldName: 'status' },
};
const seniority: DataFeatureOutput = {
    Name: 'SeniorityLevel', Ref: '$.SeniorityLevel', Constraint: { Type: 'lookup', OnViolation: 'fail' },
    Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID', LookupMatchField: 'Name' },
};
const summary: DataFeatureOutput = { Name: 'Summary', Ref: '$.Summary', Target: { Mode: 'field', EntityFieldName: 'Status' } };

describe('OutputConstraintResolver.ResolveFromFields', () => {
    it('resolves each constrained output against its target field (names in any case), without loading rows', () => {
        const map = OutputConstraintResolver.ResolveFromFields([status, seniority, summary], people);
        expect(map.get('Status')?.AllowedValues).toEqual(['Active', 'Inactive']);
        expect(map.get('SeniorityLevel')).toMatchObject({ Type: 'lookup', RelatedEntityName: 'Seniority Levels', LookupMatchField: 'Name' });
        expect(map.get('SeniorityLevel')?.AllowedValues).toBeUndefined();
        expect(map.get('Summary')).toBeNull();
    });
    it('resolves without an entity from the spec alone', () => {
        const map = OutputConstraintResolver.ResolveFromFields([seniority], undefined);
        expect(map.get('SeniorityLevel')?.RelatedEntityName).toBeUndefined();
    });
});

describe('OutputConstraintResolver.Resolve', () => {
    it('loads rows for lookup outputs only, through the loader, and attaches them', async () => {
        const rows: LookupValueRow[] = [{ Match: 'Director', Display: 'Leads a department' }];
        const loader = vi.fn<LookupRowsLoader>(async () => rows);
        const map = await OutputConstraintResolver.Resolve([status, seniority, summary], people, loader);
        expect(loader).toHaveBeenCalledTimes(1);
        expect(loader.mock.calls[0][0]).toMatchObject({ RelatedEntityName: 'Seniority Levels' });
        expect(map.get('SeniorityLevel')).toMatchObject({ AllowedValues: ['Director'], ValueDisplays: { Director: 'Leads a department' } });
        expect(map.get('Status')?.AllowedValues).toEqual(['Active', 'Inactive']);
    });
});

describe('OutputConstraintResolver for an output without a write target', () => {
    const years: DataFeatureOutput = { Name: 'Kind', Ref: '$.Kind', Constraint: { Type: 'enum', Values: ['A', 'B'], OnViolation: 'fail' } };
    it('resolves from the spec alone, keeping the listed enum values', () => {
        const map = OutputConstraintResolver.ResolveFromFields([years], people);
        expect(map.get('Kind')?.AllowedValues).toEqual(['A', 'B']);
    });
});
