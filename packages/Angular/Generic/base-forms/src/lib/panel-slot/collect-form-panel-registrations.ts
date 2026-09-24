import { MJGlobal } from '@memberjunction/global';
import { BaseFormPanel, FormPanelRegistrationMetadata } from './base-form-panel';
import type { FormContributionRegistration } from './form-contribution';

/**
 * Every BaseFormPanel registration that carries an `entity` metadata field.
 * Used by the composer and by `BaseFormComponent.formContext` to hide baked
 * related sections a panel has claimed.
 */
export function CollectFormPanelRegistrations(): FormContributionRegistration[] {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
        BaseFormPanel,
        (metadata) => {
            if (!metadata) return false;
            const entity = (metadata as Partial<FormPanelRegistrationMetadata>).entity;
            return typeof entity === 'string' && entity.length > 0;
        },
    ).map((reg) => ({
        Priority: reg.Priority,
        Metadata: reg.Metadata as FormPanelRegistrationMetadata,
    }));
}
