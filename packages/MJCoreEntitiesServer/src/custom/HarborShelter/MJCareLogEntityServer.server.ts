import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJCareLogEntityExtended, ShelterDayValue, ShelterFail, ShelterFinalize } from '@memberjunction/core-entities';
import { ShelterIsNewOrDirty, ShelterReadOne, ShelterUnverified } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Care Logs`, the check that needs the animal.
 *
 * Extends `MJCareLogEntityExtended`, so the record-only rule (care date not in the future) is
 * inherited and still runs; this adds only what one row cannot answer.
 */
@RegisterClass(BaseEntity, 'MJ: Care Logs')
export class MJCareLogEntityServer extends MJCareLogEntityExtended {
    /** Opt in — the base default is to SKIP async validation. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        if (!ShelterIsNewOrDirty(this, 'CareDate', 'AnimalID')) return result;
        const care = ShelterDayValue(this.CareDate);
        if (care === null || !this.AnimalID) return result;

        const read = await ShelterReadOne<{ ID: string; Name: string; IntakeDate: Date }>(
            this,
            'MJ: Animals',
            `ID = '${this.AnimalID}'`,
            ['ID', 'Name', 'IntakeDate'],
        );
        if (!read.ok) {
            ShelterUnverified(result, 'CareDate', "the animal's intake date");
            return ShelterFinalize(result);
        }
        // A missing animal is the FK's problem, not ours.
        const animal = read.row;
        if (!animal) return result;

        /**
         * The shelter cannot have treated an animal before it arrived. This is the inter-record
         * mirror of the animal's own "born before intake" rule: both compare a date on one row
         * against a date on another, which no CHECK constraint can reach.
         */
        const intake = ShelterDayValue(animal.IntakeDate);
        if (intake !== null && care < intake) {
            ShelterFail(
                result,
                'CareDate',
                `Care date is before ${animal.Name} arrived at the shelter — intake was later than this entry.`,
                this.CareDate,
            );
        }
        return ShelterFinalize(result);
    }
}
