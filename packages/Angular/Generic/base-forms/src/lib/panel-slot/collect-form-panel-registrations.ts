import type { FormContributionRegistration } from './form-contribution';
import { CollectClassFormPanelRegistrations } from './collect-form-contribution-registrations';

/**
 * Every compiled BaseFormPanel registration that carries an `entity` metadata field.
 *
 * Compiled registrations only — metadata-registered contributions come from
 * `CollectFormContributionRegistrations(entity, provider)`, which merges both sources.
 * Kept as a thin wrapper so existing callers and external consumers keep working.
 */
export function CollectFormPanelRegistrations(): FormContributionRegistration[] {
    return CollectClassFormPanelRegistrations();
}
