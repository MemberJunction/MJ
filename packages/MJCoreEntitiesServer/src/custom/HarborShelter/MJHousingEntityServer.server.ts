import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJHousingEntityExtended, ShelterFinalize } from '@memberjunction/core-entities';
import {
    SHELTER_IN_CARE_SQL,
    ShelterIsNewOrDirty,
    ShelterReadMany,
    ShelterUnverified,
} from './shelter-validation.helpers';
import { ShelterFail } from '@memberjunction/core-entities';

/** A unit with this species accepts any animal. */
const SPECIES_ANY = 'Any';

/**
 * MJ Academy — `MJ: Housings`, the OTHER side of the animal's housing rules.
 *
 * WHY THIS FILE EXISTS AT ALL. `MJAnimalEntityServer` already refuses to put a dog in a cat unit or
 * to exceed a unit's capacity. Every one of those rules is defeatable by editing the UNIT instead:
 * lower `Capacity` under the animals already in it, flip `Species` to the other one, or deactivate
 * it entirely. The animal-side rule then still holds for new assignments while the existing rows it
 * was protecting are already invalid.
 *
 * This is the "pair both sides" rule from guides/BASE_ENTITY_SERVER_PATTERNS.md: when an invariant
 * constrains entity A and entity B, it has to be enforced on whichever one is being mutated.
 *
 * Extends `MJHousingEntityExtended`, so the record-only rule (a unit must have a name) is inherited
 * and still runs; this adds only what one row cannot answer.
 */
@RegisterClass(BaseEntity, 'MJ: Housings')
export class MJHousingEntityServer extends MJHousingEntityExtended {
    /** Opt in — the base default is to SKIP async validation. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // A brand-new unit has no occupants, so none of these can be violated.
        if (!this.IsSaved) return result;
        // Nothing that governs occupancy is changing.
        if (!ShelterIsNewOrDirty(this, 'Capacity', 'Species', 'IsActive')) return result;

        const occupants = await this.readOccupants();
        if (!occupants.ok) {
            ShelterUnverified(result, 'Capacity', 'which animals are in this unit');
            return ShelterFinalize(result);
        }
        const rows = occupants.rows;
        if (rows.length === 0) return result; // empty unit — edit it however you like

        this.validateCapacityCoversOccupants(result, rows.length);
        this.validateStillActive(result, rows.length);
        this.validateSpeciesStillFits(result, rows);

        return ShelterFinalize(result);
    }

    /** Shrinking a unit below the animals already in it would make it instantly over capacity. */
    private validateCapacityCoversOccupants(result: ValidationResult, occupied: number): void {
        if (!ShelterIsNewOrDirty(this, 'Capacity')) return;
        if (this.Capacity >= occupied) return;
        ShelterFail(
            result,
            'Capacity',
            `Capacity cannot be ${this.Capacity} — ${occupied} animal${occupied === 1 ? ' is' : 's are'} currently in ${this.Name}. Move them first.`,
            this.Capacity,
        );
    }

    /** Taking a unit out of service while animals live in it strands them somewhere invisible. */
    private validateStillActive(result: ValidationResult, occupied: number): void {
        if (!ShelterIsNewOrDirty(this, 'IsActive')) return;
        if (this.IsActive) return;
        ShelterFail(
            result,
            'IsActive',
            `${this.Name} cannot be taken out of service — ${occupied} animal${occupied === 1 ? ' is' : 's are'} still assigned to it.`,
            this.IsActive,
        );
    }

    /**
     * Re-designating a dog kennel as a cattery is fine when it is empty, and wrong when a dog is in
     * it. 'Any' always fits, so widening is always allowed — only narrowing can strand an occupant.
     */
    private validateSpeciesStillFits(result: ValidationResult, rows: ReadonlyArray<{ Name: string; Species: string }>): void {
        if (!ShelterIsNewOrDirty(this, 'Species')) return;
        if (this.Species === SPECIES_ANY) return;

        const stranded = rows.filter((r) => r.Species !== this.Species);
        if (stranded.length === 0) return;

        const names = stranded.slice(0, 3).map((r) => r.Name).join(', ');
        const more = stranded.length > 3 ? ` and ${stranded.length - 3} more` : '';
        ShelterFail(
            result,
            'Species',
            `${this.Name} cannot be changed to ${this.Species.toLowerCase()} — ${names}${more} would no longer fit.`,
            this.Species,
        );
    }

    /**
     * One read serving all three rules. Only animals IN CARE occupy a unit: a departed animal
     * holding a stale HousingID must not keep a kennel hostage.
     *
     * Rows rather than a count, because two of the three messages name the animals that would be
     * stranded — and "Biscuit and Willa would no longer fit" is actionable where "2 animals" is not.
     */
    private async readOccupants(): Promise<{ ok: true; rows: { Name: string; Species: string }[] } | { ok: false }> {
        return ShelterReadMany<{ Name: string; Species: string }>(
            this,
            'MJ: Animals',
            `HousingID = '${this.ID}' AND ${SHELTER_IN_CARE_SQL}`,
            ['ID', 'Name', 'Species'],
        );
    }
}
