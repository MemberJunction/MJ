import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJDogEntity } from '../../generated/entity_subclasses';
import { ShelterFinalize, ShelterValidateSubtypeSpecies } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Dogs`, the dog-specific half of an Animal.
 *
 * ## What this class does NOT have to do, which is most of the lesson
 *
 * There is no code here for any of the following, and all of it works:
 *
 *   - reading the animal's name, status, breed or photo off a dog (`dog.Name` just works, and
 *     returns Animal's value — `BaseEntity` routes the read up the shared-key chain)
 *   - writing them (`dog.Status = 'Available'` sets it on Animal)
 *   - saving both tables (one `dog.Save()` writes Animal, then Dog, in one transaction)
 *   - deleting in the right order (Dog first, then Animal — the reverse of the save)
 *   - inheriting every rule module 6 wrote on `MJAnimalEntityExtended` (validation runs at every
 *     level of the chain and merges into one result)
 *   - refusing to let this animal also be a Cat (MJ enforces disjoint subtypes on create)
 *
 * None of that was written by us and none of it is generated boilerplate we are maintaining. It
 * comes from two `ParentID` values in `metadata/entities/.harbor-shelter-isa.json`. The only
 * TypeScript an IS-A subtype needs is the rules that are genuinely its own.
 *
 * ## The one rule that is genuinely its own
 *
 * A Dog record must belong to an Animal whose `Species` is `'Dog'`. See
 * `ShelterValidateSubtypeSpecies` for why that is a record-only rule even though `Species` lives on
 * a different table — it is the same logical record, so there is nothing to read.
 *
 * ## Why the temperament columns are not validated here
 *
 * `EnergyLevel` is check-constrained in the database and CodeGen already emitted a validator for it
 * into the generated `Validate()`, which `super.Validate()` carries. The three BIT columns are
 * nullable tri-states where NULL genuinely means "not assessed" — there is nothing to reject.
 */
@RegisterClass(BaseEntity, 'MJ: Dogs')
export class MJDogEntityExtended extends MJDogEntity {
    public override Validate(): ValidationResult {
        // super FIRST: it carries the CodeGen-generated field validators (the EnergyLevel value
        // list) AND, because this is an IS-A child, every rule on the Animal chain above it.
        const result = super.Validate();

        // `Get('Species')` rather than `this.Species` -- see the bootstrapping note in the helper.
        ShelterValidateSubtypeSpecies(this.Get('Species') as string | null, 'Dog', result);

        return ShelterFinalize(result);
    }
}
