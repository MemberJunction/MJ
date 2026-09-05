import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJBreedEntity } from '../../generated/entity_subclasses';
import { ShelterFail, ShelterFinalize } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Breeds`, the rules decidable from the row alone.
 *
 * Shared package, so this runs in the browser too and the message lands on the field as the user
 * types rather than after a failed save. The server class extends this one and adds the rule that
 * must count the animals already using the breed.
 */
@RegisterClass(BaseEntity, 'MJ: Breeds')
export class MJBreedEntityExtended extends MJBreedEntity {
    public override Validate(): ValidationResult {
        // super FIRST — it carries the CodeGen-generated field validators.
        const result = super.Validate();
        this.validateNamePresent(result);
        return ShelterFinalize(result);
    }

    /**
     * NOT NULL does not stop an empty or whitespace-only string.
     *
     * A breed exists only to be picked from a list on the animal form. A blank one renders as an
     * empty row that is selectable, indistinguishable from its neighbours, and — because
     * `MJBreedEntityServer` names the breed when it refuses a species change — produces a refusal
     * that never says which breed it is about.
     */
    private validateNamePresent(result: ValidationResult): void {
        if (!this.Name || this.Name.trim().length === 0) {
            ShelterFail(
                result,
                'Name',
                'Every breed needs a name — it is what staff pick from the list on the animal form.',
                this.Name,
            );
        }
    }
}
