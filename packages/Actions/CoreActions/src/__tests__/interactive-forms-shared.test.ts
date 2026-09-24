import { describe, it, expect } from 'vitest';
import {
    ApplySectionClaims,
    BumpMinorVersion,
    BumpPatchVersion,
    BumpMajorVersion,
    BumpVersion,
    ParseVersionBumpKind,
    MapToComponentStatus,
    MapFromComponentStatus,
    ParseSpecParam,
    GetStringParam,
    GetNumberParam,
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
        expect(BumpMinorVersion('1.0.0')).toBe('1.1.0');
        expect(BumpMinorVersion('1.7.3')).toBe('1.8.0');
    });

    it('treats a 2-part version as minor=patch=0', () => {
        expect(BumpMinorVersion('2.0')).toBe('2.1.0');
    });

    it('falls back to 1.1.0 for an unparseable version', () => {
        expect(BumpMinorVersion('garbage')).toBe('1.1.0');
        expect(BumpMinorVersion('')).toBe('1.1.0');
        expect(BumpMinorVersion(null)).toBe('1.1.0');
        expect(BumpMinorVersion(undefined)).toBe('1.1.0');
    });

    it('does not bump the patch component', () => {
        // Patch staying 0 is intentional — these are visible AI-cycle iterations,
        // not internal hotfixes.
        expect(BumpMinorVersion('1.0.7')).toBe('1.1.0');
        expect(BumpMinorVersion('1.2.99')).toBe('1.3.0');
    });

    it('never decreases minor', () => {
        // Property-style: bumped minor > original minor for any well-formed input
        const inputs = ['1.0.0', '1.4.2', '2.10.0', '7.1.1'];
        for (const v of inputs) {
            const after = BumpMinorVersion(v);
            const [origMaj, origMin] = v.split('.').map(Number);
            const [newMaj, newMin] = after.split('.').map(Number);
            expect(newMaj).toBe(origMaj);
            expect(newMin).toBeGreaterThan(origMin);
        }
    });
});

describe('bumpPatchVersion', () => {
    it('increments the patch component', () => {
        expect(BumpPatchVersion('1.0.0')).toBe('1.0.1');
        expect(BumpPatchVersion('1.7.3')).toBe('1.7.4');
        expect(BumpPatchVersion('2.0')).toBe('2.0.1');
    });
    it('does not touch major or minor', () => {
        expect(BumpPatchVersion('3.4.5')).toBe('3.4.6');
    });
    it('falls back to 1.0.1 for unparseable', () => {
        expect(BumpPatchVersion('garbage')).toBe('1.0.1');
        expect(BumpPatchVersion(null)).toBe('1.0.1');
        expect(BumpPatchVersion(undefined)).toBe('1.0.1');
    });
});

describe('bumpMajorVersion', () => {
    it('increments major and zeros out minor/patch', () => {
        expect(BumpMajorVersion('1.7.3')).toBe('2.0.0');
        expect(BumpMajorVersion('3.4.5')).toBe('4.0.0');
        expect(BumpMajorVersion('1.0.0')).toBe('2.0.0');
    });
    it('falls back to 2.0.0 for unparseable (treats baseline as 1.0.0)', () => {
        expect(BumpMajorVersion('garbage')).toBe('2.0.0');
        expect(BumpMajorVersion(null)).toBe('2.0.0');
    });
});

describe('bumpVersion router', () => {
    it('dispatches by kind', () => {
        expect(BumpVersion('1.7.3', 'patch')).toBe('1.7.4');
        expect(BumpVersion('1.7.3', 'minor')).toBe('1.8.0');
        expect(BumpVersion('1.7.3', 'major')).toBe('2.0.0');
    });
    it('returns current version unchanged for in-place', () => {
        expect(BumpVersion('1.7.3', 'in-place')).toBe('1.7.3');
        expect(BumpVersion(null, 'in-place')).toBe('1.0.0');
    });
});

describe('parseVersionBumpKind', () => {
    it('accepts canonical values', () => {
        expect(ParseVersionBumpKind('in-place')).toBe('in-place');
        expect(ParseVersionBumpKind('patch')).toBe('patch');
        expect(ParseVersionBumpKind('minor')).toBe('minor');
        expect(ParseVersionBumpKind('major')).toBe('major');
    });
    it('is case-insensitive and trims whitespace', () => {
        expect(ParseVersionBumpKind('  MAJOR  ')).toBe('major');
        expect(ParseVersionBumpKind('Patch')).toBe('patch');
    });
    it('accepts in-place synonyms', () => {
        expect(ParseVersionBumpKind('inplace')).toBe('in-place');
        expect(ParseVersionBumpKind('in_place')).toBe('in-place');
    });
    it('returns null for unknown / empty / null', () => {
        expect(ParseVersionBumpKind('bump')).toBeNull();
        expect(ParseVersionBumpKind('')).toBeNull();
        expect(ParseVersionBumpKind(null)).toBeNull();
        expect(ParseVersionBumpKind(undefined)).toBeNull();
    });
});

describe('mapToComponentStatus / mapFromComponentStatus', () => {
    it('maps Active ↔ Published', () => {
        expect(MapToComponentStatus('Active')).toBe('Published');
        expect(MapFromComponentStatus('Published')).toBe('Active');
    });

    it('maps Pending ↔ Draft', () => {
        expect(MapToComponentStatus('Pending')).toBe('Draft');
        expect(MapFromComponentStatus('Draft')).toBe('Pending');
    });

    it('maps Inactive ↔ Deprecated', () => {
        expect(MapToComponentStatus('Inactive')).toBe('Deprecated');
        expect(MapFromComponentStatus('Deprecated')).toBe('Inactive');
    });

    it('mapFromComponentStatus is case-insensitive', () => {
        expect(MapFromComponentStatus('published')).toBe('Active');
        expect(MapFromComponentStatus('DRAFT')).toBe('Pending');
        expect(MapFromComponentStatus('Deprecated')).toBe('Inactive');
    });

    it('mapFromComponentStatus treats unknown values as Inactive (safe default)', () => {
        expect(MapFromComponentStatus(null)).toBe('Inactive');
        expect(MapFromComponentStatus(undefined)).toBe('Inactive');
        expect(MapFromComponentStatus('whatever')).toBe('Inactive');
        expect(MapFromComponentStatus('')).toBe('Inactive');
    });
});

describe('parseSpecParam', () => {
    it('passes objects through untouched', () => {
        const spec = { name: 'F', componentRole: 'form', code: '() => null', location: 'embedded' };
        const result = ParseSpecParam(spec);
        expect(result).toBe(spec);
    });

    it('parses JSON strings', () => {
        const json = '{"name":"F","componentRole":"form"}';
        const result = ParseSpecParam(json);
        expect('error' in result).toBe(false);
        if (!('error' in result)) {
            expect(result.name).toBe('F');
            expect(result.componentRole).toBe('form');
        }
    });

    it('returns an error for malformed JSON', () => {
        const result = ParseSpecParam('not { valid json');
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
        expect(GetStringParam(p('  MJ: Apps  '), 'EntityName')).toBe('MJ: Apps');
    });

    it('is case-insensitive on the param name', () => {
        const params = {
            Params: [{ Name: 'entityName', Type: 'Input', Value: 'X' }],
        } as unknown as RunActionParams;
        expect(GetStringParam(params, 'EntityName')).toBe('X');
    });

    it('returns null for empty / missing', () => {
        expect(GetStringParam(p(''), 'EntityName')).toBeNull();
        expect(GetStringParam(p('   '), 'EntityName')).toBeNull();
        expect(GetStringParam(p(null), 'EntityName')).toBeNull();
        expect(GetStringParam(p(undefined), 'EntityName')).toBeNull();
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
        expect(GetNumberParam(p(42), 'TargetVersionSequence')).toBe(42);
    });

    it('parses numeric strings', () => {
        expect(GetNumberParam(p('17'), 'TargetVersionSequence')).toBe(17);
    });

    it('returns null for unparseable / missing', () => {
        expect(GetNumberParam(p('garbage'), 'TargetVersionSequence')).toBeNull();
        expect(GetNumberParam(p(null), 'TargetVersionSequence')).toBeNull();
        expect(GetNumberParam(p(undefined), 'TargetVersionSequence')).toBeNull();
    });
});

/**
 * A spec's section claims land in three columns. One section always goes in the single-key
 * column, whichever field the spec used, and a position is kept only for a panel drawn inside a
 * section — the only case the column's CHECK constraint allows.
 */
describe('ApplySectionClaims', () => {
    const blank = () => ({ ReplacesSectionKey: null as string | null, ReplacesSectionKeys: null as string | null,
        InSectionKey: null as string | null, SectionPosition: null as 'start' | 'end' | null });

    it('stores several replaced sections as a JSON array', () => {
        const row = blank();
        ApplySectionClaims(row, { replacesSectionKeys: ['identity', 'profile'] });
        expect(row).toEqual({ ReplacesSectionKey: null, ReplacesSectionKeys: '["identity","profile"]', InSectionKey: null, SectionPosition: null });
    });

    it('stores one replaced section in the single-key column, from either field', () => {
        const a = blank();
        ApplySectionClaims(a, { replacesSectionKeys: ['identity'] });
        const b = blank();
        ApplySectionClaims(b, { replacesSectionKey: 'identity' });
        expect(a).toEqual(b);
        expect(a.ReplacesSectionKey).toBe('identity');
        expect(a.ReplacesSectionKeys).toBeNull();
    });

    it('places a panel in a section at the position asked for', () => {
        const row = blank();
        ApplySectionClaims(row, { inSectionKey: 'identity', sectionPosition: 'end' });
        expect(row).toMatchObject({ InSectionKey: 'identity', SectionPosition: 'end', ReplacesSectionKey: null });
    });

    it('keeps a position for a field claim, and drops it for anything not drawn inside a section', () => {
        const fields = blank();
        ApplySectionClaims(fields, { replacesFieldNames: ['Name'], sectionPosition: 'end' });
        expect(fields.SectionPosition).toBe('end');
        const slot = blank();
        ApplySectionClaims(slot, { sectionPosition: 'end' });
        expect(slot.SectionPosition).toBeNull();
    });

    it('clears claims a row had when the spec no longer makes them', () => {
        const row = { ReplacesSectionKey: 'old', ReplacesSectionKeys: '["a","b"]', InSectionKey: 'x', SectionPosition: 'end' as const };
        ApplySectionClaims(row, {});
        expect(row).toEqual(blank());
    });
});
