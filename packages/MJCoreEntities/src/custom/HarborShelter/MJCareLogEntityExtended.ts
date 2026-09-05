import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJCareLogEntity } from '../../generated/entity_subclasses';
import { ShelterDayValue, ShelterFail, ShelterFinalize, ShelterTodayUTC } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Care Logs`, the rules decidable from the entry alone.
 *
 * Shared package, so this runs in the browser too and the message appears on the field as the user
 * types rather than after a failed save. The server class extends this one and adds the check that
 * needs to read the animal.
 *
 * DELIBERATELY ABSENT: `FollowUpDate >= CareDate` is already `CK_CareLog_FollowUpDate`. The database
 * can express it — it compares two columns on one row — so it stays there. Re-implementing a CHECK
 * in code buys nothing and gives you two places to change when the rule moves.
 */
@RegisterClass(BaseEntity, 'MJ: Care Logs')
export class MJCareLogEntityExtended extends MJCareLogEntity {
    public override Validate(): ValidationResult {
        // super FIRST — it carries the CodeGen-generated field validators.
        const result = super.Validate();
        this.validateCareDateNotFuture(result);
        return ShelterFinalize(result);
    }

    /**
     * Care is a record of what was DONE. A future date means someone is scheduling, and this entity
     * has a field for that: `FollowUpDate`. Allowing a future `CareDate` would also quietly corrupt
     * every "last vaccination" and "last exam" figure, since those read the newest row by date.
     */
    private validateCareDateNotFuture(result: ValidationResult): void {
        const care = ShelterDayValue(this.CareDate);
        if (care !== null && care > ShelterTodayUTC()) {
            ShelterFail(
                result,
                'CareDate',
                'Care date cannot be in the future — record care after it happens, and use Follow Up Date to schedule.',
                this.CareDate,
            );
        }
    }
}
