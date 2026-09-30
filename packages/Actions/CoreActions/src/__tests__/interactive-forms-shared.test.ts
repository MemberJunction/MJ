import { describe, it, expect } from 'vitest';
import {
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
    ResolveContributionRegistration,
} from '../custom/interactive-forms/_shared';
import type { RunActionParams } from '@memberjunction/actions-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';

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
 * Create and Modify both read a spec's registration through this one function, so the two
 * resolve the related entity and derive the row's key the same way.
 */
describe('ResolveContributionRegistration', () => {
    const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';
    const provider = {
        EntityByName: (name: string) => name.trim().toLowerCase() === TICKETS.toLowerCase()
            ? { ID: 'ENT-TICKETS', Name: TICKETS } : undefined,
    } as unknown as IMetadataProvider;

    function panelSpec(formContribution: Record<string, unknown>): ComponentSpec {
        return {
            name: 'TicketsPanel', componentRole: 'form-panel',
            formContribution: { presentation: 'panel', title: 'Tickets', ...formContribution },
        } as unknown as ComponentSpec;
    }

    it('resolves the related entity to its registered name and ID and derives the related key', () => {
        const result = ResolveContributionRegistration(
            provider, panelSpec({ relatedEntity: TICKETS.toLowerCase(), relatedJoinField: '[PersonID]' }));
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.Contribution.relatedEntity).toBe(TICKETS);
        expect(result.RowOptions).toEqual({ relatedEntityID: 'ENT-TICKETS', relatedEntityName: TICKETS, componentName: 'TicketsPanel' });
        expect(result.WriteKey).toBe(`related:${TICKETS}:PersonID`);
    });

    it('derives the panel key from spec.name when the spec names no key and claims no grid', () => {
        const result = ResolveContributionRegistration(provider, panelSpec({}));
        expect('error' in result ? null : result.WriteKey).toBe('panel:TicketsPanel');
    });

    it('keeps the current panel key of a row whose spec names no key and claims no grid', () => {
        const result = ResolveContributionRegistration(provider, panelSpec({}), 'panel:OldName');
        expect('error' in result ? null : result.WriteKey).toBe('panel:OldName');
    });

    it('derives a new key when the current key is not a panel key, or the spec supplies one', () => {
        const fromRelated = ResolveContributionRegistration(provider, panelSpec({}), `related:${TICKETS}:PersonID`);
        expect('error' in fromRelated ? null : fromRelated.WriteKey).toBe('panel:TicketsPanel');
        const authored = ResolveContributionRegistration(provider, panelSpec({ contributionKey: 'skip:tickets' }), 'panel:OldName');
        expect('error' in authored ? null : authored.WriteKey).toBe('skip:tickets');
        const claimed = ResolveContributionRegistration(provider, panelSpec({ relatedEntity: TICKETS }), 'panel:OldName');
        expect('error' in claimed ? null : claimed.WriteKey).toBe(`related:${TICKETS}:`);
    });

    it('fails with RELATED_ENTITY_NOT_FOUND for an unregistered related entity', () => {
        const result = ResolveContributionRegistration(provider, panelSpec({ relatedEntity: 'Nope' }));
        expect('error' in result ? result.error.ResultCode : null).toBe('RELATED_ENTITY_NOT_FOUND');
    });

    it('fails with INVALID_CONTRIBUTION_KEY for a key outside the permitted character set', () => {
        const result = ResolveContributionRegistration(provider, panelSpec({ contributionKey: "x'; DROP--" }));
        expect('error' in result ? result.error.ResultCode : null).toBe('INVALID_CONTRIBUTION_KEY');
    });

    it('fails with LINT_FAILED when the spec is not a form panel', () => {
        const spec = { ...panelSpec({}), componentRole: 'form' } as ComponentSpec;
        const result = ResolveContributionRegistration(provider, spec);
        expect('error' in result ? result.error.ResultCode : null).toBe('LINT_FAILED');
    });
});
