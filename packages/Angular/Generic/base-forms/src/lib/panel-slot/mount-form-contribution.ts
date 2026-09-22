import { ComponentRef, Type, ViewContainerRef } from '@angular/core';
import { LogError } from '@memberjunction/core';
import { InteractiveFormPanelComponent } from '../interactive-form/interactive-form-panel.component';
import { BaseFormPanel } from './base-form-panel';
import type { FormContributionRegistration } from './form-contribution';

/**
 * Create the component a registration names, whichever source it came from.
 *
 * A compiled registration carries its own constructor. A metadata row carries a component
 * id instead, and renders through the generic React host. Both are `BaseFormPanel`s once
 * mounted, so every caller downstream treats them the same.
 *
 * Returns null when a compiled registration has no constructor, which is a broken
 * registration rather than an empty slot, so it is logged.
 */
export function MountFormContribution(
    anchor: ViewContainerRef,
    registration: FormContributionRegistration,
): ComponentRef<BaseFormPanel> | null {
    if (registration.Source === 'metadata') {
        const ref = anchor.createComponent(InteractiveFormPanelComponent);
        ref.instance.Contribution = registration;
        return ref as unknown as ComponentRef<BaseFormPanel>;
    }
    const ctor = registration.Registration?.SubClass as Type<BaseFormPanel> | undefined;
    if (!ctor) {
        LogError(`MountFormContribution: compiled registration for ${registration.Metadata?.entity}:${registration.Metadata?.slot} has no constructor`);
        return null;
    }
    return anchor.createComponent(ctor);
}
