import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJCatEntity } from '../../generated/entity_subclasses';
import { ShelterFinalize, ShelterValidateSubtypeSpecies } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Cats`, the cat-specific half of an Animal.
 *
 * The mirror of `MJDogEntityExtended`, and deliberately just as short. Read that class's comment for
 * what IS-A supplies for free; this one exists to make the same point twice, because "the subtype
 * class is nearly empty" is the observation the module wants a learner to make on their own.
 *
 * Note what is NOT shared between the two subtypes: there is no `MJPetEntityExtended` base class
 * holding the common rule. Each subtype must extend its OWN CodeGen-generated class
 * (`MJDogEntity`, `MJCatEntity`), so there is no common ancestor available to inherit from — the
 * shared rule is a free function instead. That constraint shows up everywhere in MJ, and it is why
 * module 6's helpers are functions rather than a base class.
 */
@RegisterClass(BaseEntity, 'MJ: Cats')
export class MJCatEntityExtended extends MJCatEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();

        // `Get('Species')` rather than `this.Species` -- see the bootstrapping note in the helper.
        ShelterValidateSubtypeSpecies(this.Get('Species') as string | null, 'Cat', result);

        return ShelterFinalize(result);
    }
}
