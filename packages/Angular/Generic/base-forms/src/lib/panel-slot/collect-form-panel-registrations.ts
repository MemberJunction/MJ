import type { FormContributionRegistration } from './form-contribution';
import { CollectClassFormPanelRegistrations } from './collect-form-contribution-registrations';

/**
 * Every compiled BaseFormPanel registration that carries an `entity` metadata field. Compiled
 * registrations only: no `MJ: Entity Form Contributions` rows, and the user's hidden panels are
 * not removed.
 *
 * @deprecated Use `CollectFormContributionRegistrations(entity, provider)`, which returns the
 * compiled registrations together with the rows that apply to the entity and the current user.
 */
export function CollectFormPanelRegistrations(): FormContributionRegistration[] {
    return CollectClassFormPanelRegistrations();
}
