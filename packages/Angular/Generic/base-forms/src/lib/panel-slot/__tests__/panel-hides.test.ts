import { describe, it, expect } from 'vitest';
import type { ClassRegistration } from '@memberjunction/global';
import {
    PanelHideKey,
    PanelHideSettingKey,
    ParseHiddenPanelKeys,
    WithoutHiddenPanels,
} from '../panel-hides';
import type { FormContributionRegistration } from '../form-contribution';

/**
 * A user can hide a panel someone else put on their form — published to their role or to
 * everyone, or shipped in code — and bring it back later. Hides are stored per entity as a list
 * of keys, and applied in the collector so every consumer of the list agrees.
 */

/** A published metadata row. */
function published(key: string, scope: 'Role' | 'Global' = 'Global', rowID = 'row-1'): FormContributionRegistration {
    return {
        Priority: 0, Source: 'metadata', RowID: rowID, Scope: scope,
        Metadata: { entity: 'MoreCheese: Courses', slot: 'after-fields', contributionKey: key },
    };
}

/** The user's own metadata row. */
function mine(key: string): FormContributionRegistration {
    return {
        Priority: 0, Source: 'metadata', RowID: 'row-mine', Scope: 'User',
        Metadata: { entity: 'MoreCheese: Courses', slot: 'after-fields', contributionKey: key },
    };
}

/** A compiled panel, identified by the key it registered under. */
function compiled(registrationKey: string | null, contributionKey?: string): FormContributionRegistration {
    return {
        Priority: 0, Source: 'class',
        Registration: { Key: registrationKey } as ClassRegistration,
        Metadata: { entity: '*', slot: 'after-fields', ...(contributionKey ? { contributionKey } : {}) },
    };
}

describe('PanelHideSettingKey', () => {
    it('is one setting per entity, lowercased so case variants share it', () => {
        expect(PanelHideSettingKey('MoreCheese: Courses')).toBe('mj.formPanels.hidden.morecheese: courses');
    });
});

describe('ParseHiddenPanelKeys', () => {
    it('reads a stored list', () => {
        expect(ParseHiddenPanelKeys('["panel:A","class:b"]')).toEqual(['panel:A', 'class:b']);
    });

    it('reads nothing from a missing, malformed or non-list value, rather than throwing', () => {
        expect(ParseHiddenPanelKeys(undefined)).toEqual([]);
        expect(ParseHiddenPanelKeys('not json')).toEqual([]);
        expect(ParseHiddenPanelKeys('{"a":1}')).toEqual([]);
    });

    it('drops blank and repeated keys', () => {
        expect(ParseHiddenPanelKeys('["a","", "a", 3]')).toEqual(['a']);
    });
});

describe('PanelHideKey', () => {
    it('is the contribution key for a published row', () => {
        expect(PanelHideKey(published('panel:Cohort'))).toBe('panel:Cohort');
    });

    /**
     * Editing a published panel creates a new version, which is a new row. Keying by row would
     * let the hide lapse the moment the publisher fixed a typo.
     */
    it('is the same for two versions of one panel', () => {
        expect(PanelHideKey(published('panel:Cohort', 'Global', 'row-v1')))
            .toBe(PanelHideKey(published('panel:Cohort', 'Global', 'row-v2')));
    });

    it('is the registration key for a compiled panel that declares no contribution key', () => {
        expect(PanelHideKey(compiled('model-predictions:model-prediction')))
            .toBe('class:model-predictions:model-prediction');
    });

    it('prefers the contribution key where a compiled panel declares one', () => {
        expect(PanelHideKey(compiled('users:header', 'header'))).toBe('header');
    });

    it('is null for a panel with no stable identity, which therefore cannot be hidden', () => {
        expect(PanelHideKey(compiled(null))).toBeNull();
    });
});

describe('WithoutHiddenPanels', () => {
    it('drops a hidden published panel', () => {
        const kept = WithoutHiddenPanels([published('panel:A'), published('panel:B')], ['panel:A']);
        expect(kept.map((r) => r.Metadata.contributionKey)).toEqual(['panel:B']);
    });

    it('drops a hidden compiled panel', () => {
        const kept = WithoutHiddenPanels([compiled('model-predictions:model-prediction')],
            ['class:model-predictions:model-prediction']);
        expect(kept).toEqual([]);
    });

    /**
     * A user's own panel is turned off, not hidden. Listing its key must not make it vanish,
     * or the user would have two switches for one thing and one of them in the wrong place.
     */
    it('keeps the user\'s own panel even when its key is listed', () => {
        const kept = WithoutHiddenPanels([mine('panel:A')], ['panel:A']);
        expect(kept).toHaveLength(1);
    });

    it('returns the same list when nothing is hidden, so the collector\'s memo holds', () => {
        const regs = [published('panel:A')];
        expect(WithoutHiddenPanels(regs, [])).toBe(regs);
    });
});
