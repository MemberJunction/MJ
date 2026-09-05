import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJBreedEntityExtended, ShelterFail, ShelterFinalize } from '@memberjunction/core-entities';
import {
    SHELTER_IN_CARE_SQL,
    ShelterCountRows,
    ShelterIsNewOrDirty,
    ShelterUnverified,
} from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Breeds`, the other side of the animal's breed rules.
 *
 * Extends `MJBreedEntityExtended`, so the record-only rule (a breed must have a name) is inherited
 * and still runs; this adds only what one row cannot answer.
 *
 * WHY THIS FILE EXISTS. `MJAnimalEntityServer` refuses to attach a cat breed to a dog. That rule is
 * defeatable from here: leave the animals alone and edit the BREED instead. Flip its species and
 * every animal already using it is retroactively mismatched; retire it and the animals wearing it
 * are pointing at something the shelter has declared out of use — in both cases without a single
 * animal row being touched. Same "pair both sides" principle as `MJHousingEntityServer`.
 */
@RegisterClass(BaseEntity, 'MJ: Breeds')
export class MJBreedEntityServer extends MJBreedEntityExtended {
    /** Opt in — the base default is to SKIP async validation. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // A new breed has no animals; only a CHANGE can strand any.
        if (!this.IsSaved) return result;

        await this.validateSpeciesStillFits(result);
        await this.validateNotRetiredWhileInUse(result);

        return ShelterFinalize(result);
    }

    /**
     * Re-designating a breed's species retroactively mismatches every animal already wearing it.
     *
     * Counts against ALL animals regardless of status, not just those in care: a departed animal
     * keeps its BreedID as history, and "Adopted 2024, Labrador, species Cat" is a corrupt record
     * whether or not the animal is still on site.
     */
    private async validateSpeciesStillFits(result: ValidationResult): Promise<void> {
        if (!ShelterIsNewOrDirty(this, 'Species')) return;

        // Comparing against the PENDING species is the point: `this.Species` is the value being saved.
        const mismatched = await ShelterCountRows(
            this,
            'MJ: Animals',
            `BreedID = '${this.ID}' AND Species <> '${this.Species}'`,
        );
        if (!mismatched.ok) {
            ShelterUnverified(result, 'Species', 'which animals use this breed');
            return;
        }
        if (mismatched.count === 0) return;

        ShelterFail(
            result,
            'Species',
            `${this.Name} cannot become a ${this.Species.toLowerCase()} breed — ${mismatched.count} animal${mismatched.count === 1 ? '' : 's'} of the other species still use it.`,
            this.Species,
        );
    }

    /**
     * A breed cannot be retired while animals currently IN CARE still wear it.
     *
     * ⚠ SCOPE DECISION — "referenced" means animals still in the shelter's care (Intake / Available
     * / Hold), NOT every animal that ever wore the breed. This is deliberate and is the whole reason
     * the schema has an `IsActive` flag instead of deleting breeds: a departed animal keeps its
     * BreedID forever as history, so counting those would mean any breed used even once could never
     * be retired, and the flag would be decorative. Scoping to in-care animals gives the flag its
     * intended meaning — "withdrawn from new use, once the animals wearing it have gone" — and makes
     * this rule the exact parallel of `MJHousingEntityServer`'s "cannot be taken out of service
     * while occupied".
     *
     * To enforce the strict reading instead, drop `AND ${SHELTER_IN_CARE_SQL}` from the filter below;
     * nothing else changes.
     */
    private async validateNotRetiredWhileInUse(result: ValidationResult): Promise<void> {
        if (!ShelterIsNewOrDirty(this, 'IsActive')) return;
        if (this.IsActive) return; // activating, or already active — always fine

        const inUse = await ShelterCountRows(
            this,
            'MJ: Animals',
            `BreedID = '${this.ID}' AND ${SHELTER_IN_CARE_SQL}`,
        );
        if (!inUse.ok) {
            ShelterUnverified(result, 'IsActive', 'which animals in care use this breed');
            return;
        }
        if (inUse.count === 0) return;

        ShelterFail(
            result,
            'IsActive',
            `${this.Name} cannot be retired — ${inUse.count} animal${inUse.count === 1 ? '' : 's'} currently in care ${inUse.count === 1 ? 'is' : 'are'} still recorded as this breed. Retire it once they have been adopted or transferred.`,
            this.IsActive,
        );
    }
}
