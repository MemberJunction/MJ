import { describe, it, expect } from 'vitest';
import {
    ReadFieldSyncDirective,
    WriteFieldSyncDirective,
    ComputeExcludedSourceNames,
    StripExcludedFields,
    SYNC_DIRECTIVE_CONFIG_KEY,
} from '../SyncDirectives.js';
import { FieldMappingEngine } from '../FieldMappingEngine.js';
import { computeContentHash } from '../ContentHash.js';
import type { ICompanyIntegrationFieldMap } from '../entity-types.js';
import type { ExternalRecord } from '../types.js';

describe('ReadFieldSyncDirective', () => {
    it('defaults to Sync for null, empty, malformed, and unrecognised values', () => {
        expect(ReadFieldSyncDirective(null)).toBe('Sync');
        expect(ReadFieldSyncDirective(undefined)).toBe('Sync');
        expect(ReadFieldSyncDirective('')).toBe('Sync');
        expect(ReadFieldSyncDirective('not json at all')).toBe('Sync');
        expect(ReadFieldSyncDirective('{"syncDirective":"banana"}')).toBe('Sync');
        expect(ReadFieldSyncDirective('{"otherKey":true}')).toBe('Sync');
        // a JSON array is an object to typeof — must still be Sync
        expect(ReadFieldSyncDirective('[1,2,3]')).toBe('Sync');
    });

    it('reads Exclude case-insensitively', () => {
        expect(ReadFieldSyncDirective('{"syncDirective":"Exclude"}')).toBe('Exclude');
        expect(ReadFieldSyncDirective('{"syncDirective":"exclude"}')).toBe('Exclude');
        expect(ReadFieldSyncDirective('{"syncDirective":"EXCLUDE"}')).toBe('Exclude');
    });
});

describe('WriteFieldSyncDirective', () => {
    it('preserves unrelated Configuration keys', () => {
        const out = WriteFieldSyncDirective('{"wsfunction":"core_user_get_users","retries":3}', 'Exclude');
        const parsed = JSON.parse(out!);
        expect(parsed.wsfunction).toBe('core_user_get_users');
        expect(parsed.retries).toBe(3);
        expect(parsed[SYNC_DIRECTIVE_CONFIG_KEY]).toBe('Exclude');
    });

    it('Sync removes the key rather than storing the default, and collapses {} to null', () => {
        expect(WriteFieldSyncDirective('{"syncDirective":"Exclude"}', 'Sync')).toBeNull();
        const kept = WriteFieldSyncDirective('{"syncDirective":"Exclude","a":1}', 'Sync');
        expect(JSON.parse(kept!)).toEqual({ a: 1 });
    });

    it('refuses to destroy an unparseable existing Configuration', () => {
        expect(WriteFieldSyncDirective('{{{corrupt', 'Exclude')).toBe('{{{corrupt');
    });

    it('round-trips through ReadFieldSyncDirective', () => {
        expect(ReadFieldSyncDirective(WriteFieldSyncDirective(null, 'Exclude'))).toBe('Exclude');
        expect(ReadFieldSyncDirective(WriteFieldSyncDirective(null, 'Sync'))).toBe('Sync');
    });
});

describe('ComputeExcludedSourceNames', () => {
    it('collects only Exclude-directed fields', () => {
        const out = ComputeExcludedSourceNames([
            { Name: 'preferences', Configuration: '{"syncDirective":"Exclude"}' },
            { Name: 'enrolledcourses', Configuration: WriteFieldSyncDirective(null, 'Exclude') },
            { Name: 'fullname', Configuration: null },
            { Name: 'email', Configuration: '{"unrelated":1}' },
        ]);
        expect(out).toEqual(new Set(['preferences', 'enrolledcourses']));
    });
});

describe('StripExcludedFields', () => {
    it('returns the ORIGINAL object when nothing matches (zero-allocation fast paths)', () => {
        const fields = { a: 1, b: 2 };
        expect(StripExcludedFields(fields, new Set())).toBe(fields);
        expect(StripExcludedFields(fields, new Set(['zzz']))).toBe(fields);
    });

    it('removes exactly the excluded keys', () => {
        const out = StripExcludedFields({ a: 1, preferences: '[...]', b: 2 }, new Set(['preferences']));
        expect(out).toEqual({ a: 1, b: 2 });
    });
});

describe('FieldMappingEngine with exclusions', () => {
    const fm = (src: string, dest: string): ICompanyIntegrationFieldMap => ({
        ID: `fm-${src}`, EntityMapID: 'em-1',
        SourceFieldName: src, SourceFieldLabel: null,
        DestinationFieldName: dest, DestinationFieldLabel: null,
        Direction: 'SourceToDest', TransformPipeline: null,
        IsKeyField: src === 'id', IsRequired: false, DefaultValue: null,
        Priority: 0, OnError: 'Skip', Status: 'Active',
        Get: () => undefined,
    } as unknown as ICompanyIntegrationFieldMap);

    const record: ExternalRecord = {
        ExternalID: 'u-1',
        Fields: {
            id: 'u-1',
            fullname: 'A Person',
            preferences: '[{"name":"filepicker_recentlicense","value":"1"}]',
            enrolledcourses: '[{"id":1}]',
        },
        IsDeleted: false,
    } as unknown as ExternalRecord;

    it('an excluded field reaches neither MappedFields nor UnmappedFields', () => {
        const engine = new FieldMappingEngine();
        const [mapped] = engine.Apply(
            [record],
            [fm('id', 'ExternalID'), fm('fullname', 'FullName'), fm('preferences', 'Preferences')],
            'Test Entity',
            new Set(['preferences', 'enrolledcourses'])
        );
        // not mapped even though a field map exists for it
        expect(mapped.MappedFields.Preferences).toBeUndefined();
        expect(mapped.MappedFields.FullName).toBe('A Person');
        // not in overflow either - exclusion, not rerouting
        expect(Object.keys(mapped.UnmappedFields ?? {})).not.toContain('preferences');
        expect(Object.keys(mapped.UnmappedFields ?? {})).not.toContain('enrolledcourses');
    });

    it('the content hash is identical whether or not the excluded value changes', () => {
        const engine = new FieldMappingEngine();
        const maps = [fm('id', 'ExternalID'), fm('fullname', 'FullName'), fm('preferences', 'Preferences')];
        const excl = new Set(['preferences']);
        const changed: ExternalRecord = {
            ...record,
            Fields: { ...record.Fields, preferences: '[{"name":"filepicker_recentlicense","value":"CHANGED"}]' },
        } as unknown as ExternalRecord;
        const [a] = engine.Apply([record], maps, 'Test Entity', excl);
        const [b] = engine.Apply([changed], maps, 'Test Entity', excl);
        expect(computeContentHash(a.MappedFields)).toBe(computeContentHash(b.MappedFields));
    });

    it('without exclusions, behaviour is unchanged (regression guard)', () => {
        const engine = new FieldMappingEngine();
        const [mapped] = engine.Apply(
            [record],
            [fm('id', 'ExternalID'), fm('preferences', 'Preferences')],
            'Test Entity'
        );
        expect(mapped.MappedFields.Preferences).toBeDefined();
        // fullname has no map -> overflow captures it, exactly as before
        expect(Object.keys(mapped.UnmappedFields ?? {})).toContain('fullname');
    });

    it('does not mutate the caller record when stripping', () => {
        const engine = new FieldMappingEngine();
        engine.Apply([record], [fm('id', 'ExternalID')], 'Test Entity', new Set(['preferences']));
        expect(record.Fields.preferences).toBeDefined();
    });
});
