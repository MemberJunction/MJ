import { BaseEntity, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import { CronExpressionHelper, ComputeRoutineNextRunAt } from '@memberjunction/scheduling-engine';

/**
 * Server-side UserRoutine entity enforcing the scheduling + ownership invariants of the
 * User Routines feature (P1.5):
 *
 * 1. **NextRunAt maintenance** — on Save, when the schedule inputs changed (CronExpression /
 *    Timezone / StartAt dirty) or NextRunAt has never been computed, NextRunAt is recomputed
 *    via {@link ComputeRoutineNextRunAt} — the SAME cron helper the
 *    `UserRoutineDispatcherDriver` uses, including the StartAt floor. An **explicitly set**
 *    NextRunAt is always respected (the dispatcher's claim path advances it directly and
 *    must never be second-guessed here).
 * 2. **Validation** — `Validate()` rejects invalid cron expressions (and cron/timezone
 *    combinations that cannot produce a next occurrence) and any TargetType without a
 *    TargetID (the polymorphic reference has no FK, so this is the integrity backstop).
 * 3. **Ownership defense** — routines are private to their owner. Row-level security for
 *    these entities is not yet expressible via version-controlled metadata (RLS filter rows
 *    are migration-seeded reference data), so as defense-in-depth a non-Owner-type context
 *    user may only save routines they own. Owner-type users (including the system user the
 *    scheduler dispatches under) are exempt, which keeps the dispatcher's cross-user
 *    LastRunAt/NextRunAt bookkeeping working.
 * 4. **Owner attribution** — first save defaults `UserID` to the context user when unset
 *    (mirrors `MJAISkillEntityServer.CreatedByUserID`), so programmatic create paths
 *    (Create Record action, Remote Operations, scripts) attribute ownership correctly.
 */
@RegisterClass(BaseEntity, 'MJ: User Routines')
export class MJUserRoutineEntityServer extends MJUserRoutineEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved && !this.UserID && this.ContextCurrentUser) {
            this.UserID = this.ContextCurrentUser.ID;
        }
        this.applyNextRunAtIfNeeded();
        return super.Save(options);
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateSchedule(result);
        this.validateTarget(result);
        this.validateOwnership(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Recompute NextRunAt when the schedule changed or it was never computed — unless the
     * caller explicitly set NextRunAt on this save (dirty), which always wins (the
     * dispatcher's optimistic claim advances NextRunAt directly).
     */
    private applyNextRunAtIfNeeded(): void {
        const explicitlySet = this.GetFieldByName('NextRunAt')?.Dirty === true;
        if (explicitlySet) {
            return;
        }
        const scheduleChanged = ['CronExpression', 'Timezone', 'StartAt']
            .some(fieldName => this.GetFieldByName(fieldName)?.Dirty === true);
        if (this.NextRunAt != null && !scheduleChanged) {
            return;
        }
        try {
            this.NextRunAt = ComputeRoutineNextRunAt(this.CronExpression, this.Timezone, new Date(), this.StartAt);
        } catch {
            // Invalid cron/timezone — leave NextRunAt untouched; Validate() reports the
            // problem and fails the save with a meaningful message.
        }
    }

    /** Reject invalid cron expressions and cron/timezone combinations that cannot compute a next occurrence. */
    private validateSchedule(result: ValidationResult): void {
        const cronResult = CronExpressionHelper.ValidateExpression(this.CronExpression);
        if (!cronResult.Success) {
            result.Errors.push(...cronResult.Errors);
            return;
        }
        try {
            ComputeRoutineNextRunAt(this.CronExpression, this.Timezone, new Date(), this.StartAt);
        } catch (error) {
            result.Errors.push(new ValidationErrorInfo(
                'CronExpression',
                `Cannot compute a next run time from CronExpression '${this.CronExpression}' with Timezone '${this.Timezone}': ` +
                `${error instanceof Error ? error.message : String(error)}`,
                this.CronExpression,
                ValidationErrorType.Failure
            ));
        }
    }

    /** The polymorphic TargetID has no FK — require it whenever a TargetType is set. */
    private validateTarget(result: ValidationResult): void {
        if (this.TargetType && !this.TargetID) {
            result.Errors.push(new ValidationErrorInfo(
                'TargetID',
                `TargetID is required — a routine with TargetType '${this.TargetType}' must reference a ${this.TargetType} record.`,
                this.TargetID,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
     * Defense-in-depth ownership gate: a non-Owner-type context user may only save routines
     * they own (compared against the PRE-save owner, so reassigning UserID cannot bypass it).
     * Owner-type users — admins and the scheduler's system user — are exempt.
     */
    private validateOwnership(result: ValidationResult): void {
        const user = this.ContextCurrentUser;
        if (!user || user.Type?.trim().toLowerCase() === 'owner') {
            return;
        }
        const preSaveOwnerId = (this.GetFieldByName('UserID')?.OldValue as string | null | undefined) ?? this.UserID;
        if (preSaveOwnerId && !UUIDsEqual(preSaveOwnerId, user.ID)) {
            result.Errors.push(new ValidationErrorInfo(
                'UserID',
                'Routines are private to their owner — you can only modify routines you own.',
                this.UserID,
                ValidationErrorType.Failure
            ));
        }
    }
}
