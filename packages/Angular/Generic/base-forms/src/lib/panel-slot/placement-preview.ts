import { InjectionToken } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { FormPanelRegistrationMetadata, FormPanelSlot } from './base-form-panel';
import { ResolveContributionKey, type FormContributionRegistration } from './form-contribution';

/**
 * A panel the placement dialog shows on a real form before anything is saved.
 *
 * The dialog provides one of these to the form it renders as its preview. Every place that
 * collects a form's contributions adds this registration, so the form itself decides where the
 * panel draws, what it hides and what rail item it gets. A form outside the preview has no
 * provider, so nothing else ever sees it.
 */
export class FormPlacementPreview {
    private readonly changed = new Subject<void>();
    private registration: FormContributionRegistration | null = null;
    private replacesRowID: string | null = null;

    /** Emits after the previewed panel changes, so mounted slots can redraw. */
    public get Changed$(): Observable<void> {
        return this.changed.asObservable();
    }

    /** The previewed panel, or null when there is none. */
    public get Registration(): FormContributionRegistration | null {
        return this.registration;
    }

    /** The saved row this panel is an edit of. That row is left off the preview form. */
    public get ReplacesRowID(): string | null {
        return this.replacesRowID;
    }

    /**
     * Shows `spec` on the preview form, or nothing when it is null. With a `component` the
     * panel draws that component; without one it draws a placeholder.
     */
    public Show(
        entityName: string,
        spec: FormContributionSpec | null,
        replacesRowID: string | null = null,
        component: PlacementPreviewComponent | null = null,
    ): void {
        this.registration = spec ? PlacementPreviewRegistration(entityName, spec, component) : null;
        this.replacesRowID = replacesRowID;
        this.changed.next();
    }
}

/** The component the previewed panel draws: a spec not saved yet, or a saved component's ID. */
export interface PlacementPreviewComponent {
    Spec?: ComponentSpec | null;
    ComponentID?: string | null;
}

/** Provided by the placement dialog's preview. Absent everywhere else. */
export const FORM_PLACEMENT_PREVIEW = new InjectionToken<FormPlacementPreview>('FormPlacementPreview');

/** The key a preview uses when the spec names none, so its panel still has a stable identity. */
export const PLACEMENT_PREVIEW_KEY = 'placement-preview';

/**
 * The previewed spec as a registration.
 *
 * Ranked 0, like a new row: {@link WithPlacementPreview} already drops whatever it replaces, so
 * it competes with nothing, and on a `SortKey` tie it draws after the panels already there, as
 * the saved row will.
 */
export function PlacementPreviewRegistration(
    entityName: string,
    spec: FormContributionSpec,
    component: PlacementPreviewComponent | null = null,
): FormContributionRegistration {
    const metadata: FormPanelRegistrationMetadata = {
        entity: entityName,
        slot: (spec.slot ?? 'after-fields') as FormPanelSlot,
        sortKey: spec.sortKey ?? 0,
        presentation: spec.presentation,
    };
    if (spec.relatedEntity) metadata.relatedEntity = spec.relatedEntity;
    if (spec.relatedJoinField) metadata.relatedJoinField = spec.relatedJoinField;
    if (spec.replacesSectionKey) metadata.replacesSectionKey = spec.replacesSectionKey;
    if (spec.replacesFieldNames && spec.replacesFieldNames.length > 0) metadata.replacesFieldNames = [...spec.replacesFieldNames];
    if (spec.replacesSectionKeys && spec.replacesSectionKeys.length > 0) metadata.replacesSectionKeys = [...spec.replacesSectionKeys];
    if (spec.inSectionKey) metadata.inSectionKey = spec.inSectionKey;
    if (spec.sectionPosition) metadata.sectionPosition = spec.sectionPosition;
    if (spec.inclusion) metadata.inclusion = spec.inclusion;
    if (spec.chromeGroup) metadata.chromeGroup = spec.chromeGroup;
    metadata.contributionKey = spec.contributionKey?.trim() || ResolveContributionKey(metadata) || PLACEMENT_PREVIEW_KEY;
    return {
        Priority: 0,
        Metadata: metadata,
        Source: 'metadata',
        Title: spec.title,
        Icon: spec.icon,
        Presentation: spec.presentation,
        Configuration: spec.configuration ?? {},
        IsPreview: true,
        ComponentSpec: component?.Spec ?? undefined,
        ComponentID: component?.ComponentID ?? undefined,
    };
}

const merged = new WeakMap<FormContributionRegistration, { Base: readonly FormContributionRegistration[]; ReplacesRowID: string | null; List: FormContributionRegistration[] }>();

/**
 * `base` with the previewed panel added.
 *
 * A registration under the same key is dropped, as is the row being edited, so the preview
 * shows the panel that would be saved and not the one it replaces. The result is memoized per
 * (registration, base list), because the form reads this on every change-detection pass and
 * compares lists by identity.
 */
export function WithPlacementPreview(
    base: FormContributionRegistration[],
    preview: FormPlacementPreview | null | undefined,
): FormContributionRegistration[] {
    const reg = preview?.Registration;
    if (!reg) return base;
    const replacesRowID = preview!.ReplacesRowID;
    const hit = merged.get(reg);
    if (hit && hit.Base === base && hit.ReplacesRowID === replacesRowID) return hit.List;

    const key = (reg.Metadata.contributionKey ?? '').trim().toLowerCase();
    const rowID = (replacesRowID ?? '').toLowerCase();
    const kept = base.filter((other) => {
        if (rowID && (other.RowID ?? '').toLowerCase() === rowID) return false;
        return ResolveContributionKey(other.Metadata).toLowerCase() !== key;
    });
    const list = [...kept, reg];
    merged.set(reg, { Base: base, ReplacesRowID: replacesRowID, List: list });
    return list;
}
