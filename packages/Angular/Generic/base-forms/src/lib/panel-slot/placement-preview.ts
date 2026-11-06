import { InjectionToken } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { UUIDsEqual } from '@memberjunction/global';
import { ContributionSpecToRegistration, ResolveContributionKey, type FormContributionRegistration } from './form-contribution';

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
 * the saved row will. A spec with no key of its own takes the derived one, or
 * {@link PLACEMENT_PREVIEW_KEY}.
 */
export function PlacementPreviewRegistration(
    entityName: string,
    spec: FormContributionSpec,
    component: PlacementPreviewComponent | null = null,
): FormContributionRegistration {
    const registration = ContributionSpecToRegistration(entityName, spec, component?.ComponentID ?? undefined);
    registration.Metadata.contributionKey = ResolveContributionKey(registration.Metadata) || PLACEMENT_PREVIEW_KEY;
    registration.IsPreview = true;
    if (component?.Spec) registration.ComponentSpec = component.Spec;
    return registration;
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

    const key = ResolveContributionKey(reg.Metadata);
    const kept = base.filter((other) => {
        if (replacesRowID && other.RowID && UUIDsEqual(other.RowID, replacesRowID)) return false;
        return ResolveContributionKey(other.Metadata) !== key;
    });
    const list = [...kept, reg];
    merged.set(reg, { Base: base, ReplacesRowID: replacesRowID, List: list });
    return list;
}
