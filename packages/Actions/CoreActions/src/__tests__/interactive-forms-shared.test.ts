import { describe, it, expect } from 'vitest';
import {
    bumpMinorVersion,
    bumpPatchVersion,
    bumpMajorVersion,
    bumpVersion,
    parseVersionBumpKind,
    mapToComponentStatus,
    mapFromComponentStatus,
    parseSpecParam,
    getStringParam,
    getNumberParam,
} from '../custom/interactive-forms/_shared';
import type { RunActionParams } from '@memberjunction/actions-base';

/**
 * The interactive-form action family shares a small kit of helpers in
 * `_shared.ts` — version bumping, status-union mapping, parameter parsing.
 * These tests pin the contract because the surrounding actions depend on
 * the exact semantics (e.g. "modify produces 1.1.0, not 1.0.1").
 */

describe('bumpMinorVersion', () => {
    it('bumps minor from a 3-part version', () => {
        expect(bumpMinorVersion('1.0.0')).toBe('1.1.0');
        expect(bumpMinorVersion('1.7.3')).toBe('1.8.0');
    });

    it('treats a 2-part version as minor=patch=0', () => {
        expect(bumpMinorVersion('2.0')).toBe('2.1.0');
    });

    it('falls back to 1.1.0 for an unparseable version', () => {
        expect(bumpMinorVersion('garbage')).toBe('1.1.0');
        expect(bumpMinorVersion('')).toBe('1.1.0');
        expect(bumpMinorVersion(null)).toBe('1.1.0');
        expect(bumpMinorVersion(undefined)).toBe('1.1.0');
    });

    it('does not bump the patch component', () => {
        // Patch staying 0 is intentional — these are visible AI-cycle iterations,
        // not internal hotfixes.
        expect(bumpMinorVersion('1.0.7')).toBe('1.1.0');
        expect(bumpMinorVersion('1.2.99')).toBe('1.3.0');
    });

    it('never decreases minor', () => {
        // Property-style: bumped minor > original minor for any well-formed input
        const inputs = ['1.0.0', '1.4.2', '2.10.0', '7.1.1'];
        for (const v of inputs) {
            const after = bumpMinorVersion(v);
            const [origMaj, origMin] = v.split('.').map(Number);
            const [newMaj, newMin] = after.split('.').map(Number);
            expect(newMaj).toBe(origMaj);
            expect(newMin).toBeGreaterThan(origMin);
        }
    });
});

describe('bumpPatchVersion', () => {
    it('increments the patch component', () => {
        expect(bumpPatchVersion('1.0.0')).toBe('1.0.1');
        expect(bumpPatchVersion('1.7.3')).toBe('1.7.4');
        expect(bumpPatchVersion('2.0')).toBe('2.0.1');
    });
    it('does not touch major or minor', () => {
        expect(bumpPatchVersion('3.4.5')).toBe('3.4.6');
    });
    it('falls back to 1.0.1 for unparseable', () => {
        expect(bumpPatchVersion('garbage')).toBe('1.0.1');
        expect(bumpPatchVersion(null)).toBe('1.0.1');
        expect(bumpPatchVersion(undefined)).toBe('1.0.1');
    });
});

describe('bumpMajorVersion', () => {
    it('increments major and zeros out minor/patch', () => {
        expect(bumpMajorVersion('1.7.3')).toBe('2.0.0');
        expect(bumpMajorVersion('3.4.5')).toBe('4.0.0');
        expect(bumpMajorVersion('1.0.0')).toBe('2.0.0');
    });
    it('falls back to 2.0.0 for unparseable (treats baseline as 1.0.0)', () => {
        expect(bumpMajorVersion('garbage')).toBe('2.0.0');
        expect(bumpMajorVersion(null)).toBe('2.0.0');
    });
});

describe('bumpVersion router', () => {
    it('dispatches by kind', () => {
        expect(bumpVersion('1.7.3', 'patch')).toBe('1.7.4');
        expect(bumpVersion('1.7.3', 'minor')).toBe('1.8.0');
        expect(bumpVersion('1.7.3', 'major')).toBe('2.0.0');
    });
    it('returns current version unchanged for in-place', () => {
        expect(bumpVersion('1.7.3', 'in-place')).toBe('1.7.3');
        expect(bumpVersion(null, 'in-place')).toBe('1.0.0');
    });
});

describe('parseVersionBumpKind', () => {
    it('accepts canonical values', () => {
        expect(parseVersionBumpKind('in-place')).toBe('in-place');
        expect(parseVersionBumpKind('patch')).toBe('patch');
        expect(parseVersionBumpKind('minor')).toBe('minor');
        expect(parseVersionBumpKind('major')).toBe('major');
    });
    it('is case-insensitive and trims whitespace', () => {
        expect(parseVersionBumpKind('  MAJOR  ')).toBe('major');
        expect(parseVersionBumpKind('Patch')).toBe('patch');
    });
    it('accepts in-place synonyms', () => {
        expect(parseVersionBumpKind('inplace')).toBe('in-place');
        expect(parseVersionBumpKind('in_place')).toBe('in-place');
    });
    it('returns null for unknown / empty / null', () => {
        expect(parseVersionBumpKind('bump')).toBeNull();
        expect(parseVersionBumpKind('')).toBeNull();
        expect(parseVersionBumpKind(null)).toBeNull();
        expect(parseVersionBumpKind(undefined)).toBeNull();
    });
});

describe('mapToComponentStatus / mapFromComponentStatus', () => {
    it('maps Active ↔ Published', () => {
        expect(mapToComponentStatus('Active')).toBe('Published');
        expect(mapFromComponentStatus('Published')).toBe('Active');
    });

    it('maps Pending ↔ Draft', () => {
        expect(mapToComponentStatus('Pending')).toBe('Draft');
        expect(mapFromComponentStatus('Draft')).toBe('Pending');
    });

    it('maps Inactive ↔ Deprecated', () => {
        expect(mapToComponentStatus('Inactive')).toBe('Deprecated');
        expect(mapFromComponentStatus('Deprecated')).toBe('Inactive');
    });

    it('mapFromComponentStatus is case-insensitive', () => {
        expect(mapFromComponentStatus('published')).toBe('Active');
        expect(mapFromComponentStatus('DRAFT')).toBe('Pending');
        expect(mapFromComponentStatus('Deprecated')).toBe('Inactive');
    });

    it('mapFromComponentStatus treats unknown values as Inactive (safe default)', () => {
        expect(mapFromComponentStatus(null)).toBe('Inactive');
        expect(mapFromComponentStatus(undefined)).toBe('Inactive');
        expect(mapFromComponentStatus('whatever')).toBe('Inactive');
        expect(mapFromComponentStatus('')).toBe('Inactive');
    });
});

describe('parseSpecParam', () => {
    it('passes objects through untouched', () => {
        const spec = { name: 'F', componentRole: 'form', code: '() => null', location: 'embedded' };
        const result = parseSpecParam(spec);
        expect(result).toBe(spec);
    });

    it('parses JSON strings', () => {
        const json = '{"name":"F","componentRole":"form"}';
        const result = parseSpecParam(json);
        expect('error' in result).toBe(false);
        if (!('error' in result)) {
            expect(result.name).toBe('F');
            expect(result.componentRole).toBe('form');
        }
    });

    it('returns an error for malformed JSON', () => {
        const result = parseSpecParam('not { valid json');
        expect('error' in result).toBe(true);
    });
});

describe('getStringParam', () => {
    function p(value: unknown): RunActionParams {
        return {
            Params: value === undefined
                ? []
                : [{ Name: 'EntityName', Type: 'Input', Value: value }],
        } as unknown as RunActionParams;
    }

    it('returns trimmed string when present', () => {
        expect(getStringParam(p('  MJ: Apps  '), 'EntityName')).toBe('MJ: Apps');
    });

    it('is case-insensitive on the param name', () => {
        const params = {
            Params: [{ Name: 'entityName', Type: 'Input', Value: 'X' }],
        } as unknown as RunActionParams;
        expect(getStringParam(params, 'EntityName')).toBe('X');
    });

    it('returns null for empty / missing', () => {
        expect(getStringParam(p(''), 'EntityName')).toBeNull();
        expect(getStringParam(p('   '), 'EntityName')).toBeNull();
        expect(getStringParam(p(null), 'EntityName')).toBeNull();
        expect(getStringParam(p(undefined), 'EntityName')).toBeNull();
    });
});

describe('getNumberParam', () => {
    function p(value: unknown): RunActionParams {
        return {
            Params: value === undefined
                ? []
                : [{ Name: 'TargetVersionSequence', Type: 'Input', Value: value }],
        } as unknown as RunActionParams;
    }

    it('returns numeric values directly', () => {
        expect(getNumberParam(p(42), 'TargetVersionSequence')).toBe(42);
    });

    it('parses numeric strings', () => {
        expect(getNumberParam(p('17'), 'TargetVersionSequence')).toBe(17);
    });

    it('returns null for unparseable / missing', () => {
        expect(getNumberParam(p('garbage'), 'TargetVersionSequence')).toBeNull();
        expect(getNumberParam(p(null), 'TargetVersionSequence')).toBeNull();
        expect(getNumberParam(p(undefined), 'TargetVersionSequence')).toBeNull();
    });
});
