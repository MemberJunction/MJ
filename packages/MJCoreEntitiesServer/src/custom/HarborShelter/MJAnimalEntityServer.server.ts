import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAnimalEntityExtended, ShelterFail, ShelterFinalize } from '@memberjunction/core-entities';
import {
    SHELTER_IN_CARE as IN_CARE,
    SHELTER_IN_CARE_SQL as IN_CARE_SQL,
    ShelterCountRows,
    ShelterIsNewOrDirty,
    ShelterReadOne,
    ShelterUnverified,
} from './shelter-validation.helpers';

/** A housing unit with this species accepts any animal. */
const SPECIES_ANY = 'Any';

/**
 * MJ Academy — `MJ: Animals`, the rules that need to look at OTHER records.
 *
 * It extends `MJAnimalEntityExtended`, so every record-only rule from that class is inherited and
 * still runs here — this adds only what a single record cannot answer. That inheritance is the
 * point: the browser gets the cheap rules instantly, the server gets those PLUS these, and neither
 * set is written twice.
 *
 * WHY NOT DATABASE TRIGGERS (per guides/BASE_ENTITY_SERVER_PATTERNS.md): triggers raise ugly error
 * stacks, are SQL-Server-specific, cannot be unit-tested without a database, and bypass
 * `LatestResult` so the framework has no clean message to hand the caller. A `ValidateAsync`
 * failure arrives as ordinary validation with a field name attached.
 *
 * THE ONE THING THAT MAKES OR BREAKS THIS FILE: `DefaultSkipAsyncValidation` is `true` on the base
 * class. Without the override below, every rule here is dead code that never runs and never
 * complains — the most expensive kind of bug, because the tests you write by hand still pass.
 *
 * EVERY CHECK FAST-PATHS. `ValidateAsync` runs inside every `Save()`, so each rule returns
 * immediately unless the field it governs is actually new or dirty. Skipping that turns one save
 * into four extra queries, forever.
 */
@RegisterClass(BaseEntity, 'MJ: Animals')
export class MJAnimalEntityServer extends MJAnimalEntityExtended {
    /** Opt in. The base default is `true`, i.e. skip — see the class note. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        // A record that already failed the cheap rules should not spend four queries proving it.
        if (!result.Success) return result;

        await Promise.all([
            this.validateBreedMatchesSpecies(result),
            this.validateHousingAcceptsAnimal(result),
            this.validateAvailableRequiresVaccination(result),
        ]);

        return ShelterFinalize(result);
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    /**
     * A dog breed cannot be attached to a cat. `Breed` carries its own `Species` precisely so this
     * rule is possible — the schema was designed for it — but no constraint can express it, because
     * it compares a column on THIS row against a column on the row it points at.
     */
    private async validateBreedMatchesSpecies(result: ValidationResult): Promise<void> {
        if (!this.BreedID) return;
        if (!ShelterIsNewOrDirty(this, 'BreedID', 'Species')) return;

        const read = await ShelterReadOne<{ ID: string; Name: string; Species: string }>(
            this,
            'MJ: Breeds',
            `ID = '${this.BreedID}'`,
            ['ID', 'Name', 'Species'],
        );
        if (!read.ok) return ShelterUnverified(result, 'BreedID', "this animal's breed");
        // A missing breed is the FK's job to reject, not ours -- staying silent avoids two errors
        // for one mistake.
        const breed = read.row;
        if (!breed) return;

        // `this.Species` is the PENDING value, not the stored one: BaseEntity.Get returns
        // EntityField.Value (OldValue holds the persisted one). So changing species and breed
        // together in a single save compares the new breed against the NEW species and passes,
        // which is what a correction should do.
        if (breed.Species !== this.Species) {
            ShelterFail(
                result,
                'BreedID',
                `${breed.Name} is a ${breed.Species.toLowerCase()} breed, but this animal is a ${this.Species.toLowerCase()}.`,
                this.BreedID,
            );
        }
    }

    /**
     * Two rules about the unit, sharing one read of it: it must accept the species, and it must
     * have room. Splitting them would double the query for no gain.
     */
    private async validateHousingAcceptsAnimal(result: ValidationResult): Promise<void> {
        if (!this.HousingID) return;
        // Only when the assignment or the species is actually changing. Re-saving an animal that
        // has sat in the same kennel for weeks must not re-run this.
        if (!ShelterIsNewOrDirty(this, 'HousingID', 'Species', 'Status')) return;
        // A departed animal holds no unit; the inherited record-only rule already rejects that.
        if (!IN_CARE.includes(this.Status)) return;

        const read = await ShelterReadOne<{ ID: string; Name: string; Species: string; Capacity: number; IsActive: boolean }>(
            this,
            'MJ: Housings',
            `ID = '${this.HousingID}'`,
            ['ID', 'Name', 'Species', 'Capacity', 'IsActive'],
        );
        if (!read.ok) return ShelterUnverified(result, 'HousingID', 'the housing assignment');
        const unit = read.row;
        if (!unit) return;

        if (unit.IsActive === false) {
            ShelterFail(result, 'HousingID', `${unit.Name} is out of service and cannot take an animal.`, this.HousingID);
            return;
        }

        if (unit.Species !== SPECIES_ANY && unit.Species !== this.Species) {
            ShelterFail(
                result,
                'HousingID',
                `${unit.Name} takes ${unit.Species.toLowerCase()}s — this animal is a ${this.Species.toLowerCase()}.`,
                this.HousingID,
            );
            return;
        }

        // Occupancy counts only animals still IN CARE. An adopted animal that kept a stale
        // HousingID would otherwise make a unit look full when it is empty -- which is the same
        // defect the occupancy Query had before its status filter was added.
        const occupancy = await ShelterCountRows(this,
            'MJ: Animals',
            `HousingID = '${this.HousingID}' AND ${IN_CARE_SQL}` +
                // Exclude this animal so re-saving an occupant never counts it twice.
                (this.IsSaved ? ` AND ID <> '${this.ID}'` : ''),
        );
        if (!occupancy.ok) return ShelterUnverified(result, 'HousingID', 'how full that unit is');
        const occupants = occupancy.count;
        if (occupants >= unit.Capacity) {
            ShelterFail(
                result,
                'HousingID',
                `${unit.Name} is full — ${occupants} of ${unit.Capacity} spaces are taken.`,
                this.HousingID,
            );
        }
    }

    /**
     * An animal cannot be offered for adoption without a completed vaccination on file. This is the
     * child-lookup shape: not "is a field valid" but "does a related record exist".
     */
    private async validateAvailableRequiresVaccination(result: ValidationResult): Promise<void> {
        if (this.Status !== 'Available') return;
        if (!ShelterIsNewOrDirty(this, 'Status')) return;
        // An unsaved animal has no care history yet, and blocking it here would make it impossible
        // to create one that is already vaccinated. The rule bites on the transition TO Available.
        if (!this.IsSaved) return;

        const vaccinations = await ShelterCountRows(this,
            'MJ: Care Logs',
            `AnimalID = '${this.ID}' AND CareType = 'Vaccination' AND IsComplete = 1`,
        );
        if (!vaccinations.ok) return ShelterUnverified(result, 'Status', "this animal's vaccination history");
        if (vaccinations.count === 0) {
            ShelterFail(
                result,
                'Status',
                'This animal cannot be made Available — it has no completed vaccination in its care log.',
                this.Status,
            );
        }
    }

}
