import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJHousingEntity } from '../../generated/entity_subclasses';
import { ShelterFail, ShelterFinalize } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Housings`, the rules decidable from the row alone.
 *
 * Shared package, so this runs in the browser too and the message lands on the field as the user
 * types rather than after a failed save. The server class extends this one and adds the three rules
 * that must count the animals actually in the unit.
 */
@RegisterClass(BaseEntity, 'MJ: Housings')
export class MJHousingEntityExtended extends MJHousingEntity {
    public override Validate(): ValidationResult {
        // super FIRST — it carries the CodeGen-generated field validators.
        const result = super.Validate();
        this.validateNamePresent(result);
        return ShelterFinalize(result);
    }

    /**
     * NOT NULL does not stop an empty or whitespace-only string.
     *
     * A unit's name is not decoration: it is the only handle staff have on a physical kennel, and
     * `MJHousingEntityServer` interpolates it into every one of its refusals ("Kennel 4 cannot be
     * taken out of service — 2 animals are still assigned to it"). A blank name turns each of those
     * into a sentence that starts with nothing, so the person reading it cannot tell which unit
     * blocked them.
     */
    private validateNamePresent(result: ValidationResult): void {
        if (!this.Name || this.Name.trim().length === 0) {
            ShelterFail(
                result,
                'Name',
                'Every housing unit needs a name — use whatever staff call it on the floor, e.g. "Kennel 4" or "Cattery B".',
                this.Name,
            );
        }
    }
}
