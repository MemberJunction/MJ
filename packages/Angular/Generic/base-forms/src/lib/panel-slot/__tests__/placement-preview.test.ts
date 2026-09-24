import { describe, it, expect } from 'vitest';
import {
    FormPlacementPreview,
    PLACEMENT_PREVIEW_KEY,
    PlacementPreviewRegistration,
    WithPlacementPreview,
} from '../placement-preview';
import type { FormContributionRegistration } from '../form-contribution';

/**
 * The placement dialog draws its unsaved panel on a real copy of the form. The form collects its
 * contributions as usual, with this one registration added, so the form itself decides where the
 * panel goes and what it hides. These are the rules for adding it.
 */

const ENTITY = 'MoreCheese: Courses';

function saved(key: string, rowID = 'row-1'): FormContributionRegistration {
    return { Priority: 5, Source: 'metadata', RowID: rowID, Metadata: { entity: ENTITY, slot: 'after-fields', contributionKey: key } };
}

function previewOf(spec: Parameters<FormPlacementPreview['Show']>[1], replacesRowID: string | null = null): FormPlacementPreview {
    const preview = new FormPlacementPreview();
    preview.Show(ENTITY, spec, replacesRowID);
    return preview;
}

describe('PlacementPreviewRegistration', () => {
    it('marks the registration as a preview, ranked like a new row', () => {
        const reg = PlacementPreviewRegistration(ENTITY, { presentation: 'panel', title: 'Cohort', slot: 'before-fields' });
        expect(reg.IsPreview).toBe(true);
        expect(reg.Priority).toBe(0);
        expect(reg.Metadata).toMatchObject({ entity: ENTITY, slot: 'before-fields', presentation: 'panel' });
        expect(reg.Title).toBe('Cohort');
    });

    it('gives a keyless panel a stable key of its own', () => {
        const reg = PlacementPreviewRegistration(ENTITY, { presentation: 'panel', title: 'Cohort' });
        expect(reg.Metadata.contributionKey).toBe(PLACEMENT_PREVIEW_KEY);
    });

    it('takes the key a related claim resolves to, so the stock grid is hidden', () => {
        const reg = PlacementPreviewRegistration(ENTITY, {
            presentation: 'panel', title: 'Roster', relatedEntity: 'MoreCheese: Enrollments', relatedJoinField: 'CourseID',
        });
        expect(reg.Metadata.contributionKey).toBe('related:MoreCheese: Enrollments:CourseID');
    });

    it('carries every claim the saved row would carry', () => {
        const reg = PlacementPreviewRegistration(ENTITY, {
            presentation: 'bare', title: 'Hero', replacesSectionKey: 'details', chromeGroup: 'details',
        });
        expect(reg.Metadata).toMatchObject({ replacesSectionKey: 'details', chromeGroup: 'details', presentation: 'bare' });
        const fields = PlacementPreviewRegistration(ENTITY, { presentation: 'panel', title: 'F', replacesFieldNames: ['Name', 'Code'] });
        expect(fields.Metadata.replacesFieldNames).toEqual(['Name', 'Code']);
    });
});

describe('PlacementPreviewRegistration — the component it draws', () => {
    it('carries a component that is not saved yet, so the preview draws it', () => {
        const component = { name: 'CohortPanel', componentRole: 'form-panel' } as never;
        const reg = PlacementPreviewRegistration(ENTITY, { presentation: 'panel', title: 'Cohort' }, { Spec: component });
        expect(reg.ComponentSpec).toBe(component);
        expect(reg.ComponentID).toBeUndefined();
    });

    it('carries a saved component\'s ID when the panel is an edit', () => {
        const reg = PlacementPreviewRegistration(ENTITY, { presentation: 'panel', title: 'Cohort' }, { ComponentID: 'COMP-9' });
        expect(reg.ComponentID).toBe('COMP-9');
    });

    it('carries neither without one, so a placeholder draws', () => {
        const reg = PlacementPreviewRegistration(ENTITY, { presentation: 'panel', title: 'Cohort' });
        expect(reg.ComponentSpec).toBeUndefined();
        expect(reg.ComponentID).toBeUndefined();
    });
});

describe('WithPlacementPreview', () => {
    it('returns the list untouched when there is no preview', () => {
        const base = [saved('panel:A')];
        expect(WithPlacementPreview(base, null)).toBe(base);
        expect(WithPlacementPreview(base, previewOf(null))).toBe(base);
    });

    it('adds the previewed panel', () => {
        const list = WithPlacementPreview([saved('panel:A')], previewOf({ presentation: 'panel', title: 'New' }));
        expect(list.map((r) => r.Metadata.contributionKey)).toEqual(['panel:A', PLACEMENT_PREVIEW_KEY]);
    });

    it('drops the panel whose key it takes over, so only the new one shows', () => {
        const list = WithPlacementPreview(
            [saved('panel:A'), saved('panel:B', 'row-2')],
            previewOf({ presentation: 'panel', title: 'New', contributionKey: 'panel:A' }),
        );
        expect(list.map((r) => r.RowID ?? 'preview')).toEqual(['row-2', 'preview']);
    });

    it('drops the saved row being edited, even when the edit changes its key', () => {
        const list = WithPlacementPreview(
            [saved('panel:A', 'row-edit'), saved('panel:B', 'row-2')],
            previewOf({ presentation: 'panel', title: 'Moved', contributionKey: 'panel:Z' }, 'ROW-EDIT'),
        );
        expect(list.map((r) => r.RowID ?? 'preview')).toEqual(['row-2', 'preview']);
    });

    it('returns the same list on every read until the base or the panel changes', () => {
        const base = [saved('panel:A')];
        const preview = previewOf({ presentation: 'panel', title: 'New' });
        const first = WithPlacementPreview(base, preview);
        expect(WithPlacementPreview(base, preview)).toBe(first);
        preview.Show(ENTITY, { presentation: 'panel', title: 'Renamed' });
        expect(WithPlacementPreview(base, preview)).not.toBe(first);
    });
});

describe('FormPlacementPreview', () => {
    it('tells mounted slots to redraw when the panel changes', () => {
        const preview = new FormPlacementPreview();
        let redraws = 0;
        preview.Changed$.subscribe(() => redraws++);
        preview.Show(ENTITY, { presentation: 'panel', title: 'A' });
        preview.Show(ENTITY, null);
        expect(redraws).toBe(2);
        expect(preview.Registration).toBeNull();
    });
});
