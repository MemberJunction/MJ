import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAdopterEntityExtended, ShelterFail, ShelterFinalize } from '@memberjunction/core-entities';
import { ShelterCountRows, ShelterIsNewOrDirty, ShelterUnverified } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Adopters`, the rules that need to look at OTHER records.
 *
 * ## This class exists because of module 6's lesson, not because of a new idea
 *
 * Module 6's central point was that **every rule enforced on one side is defeatable from the other**.
 * `MJAdoptionEntityServer` refuses to complete an adoption unless the adopter is approved — so a
 * user who wants it completed anyway does not fight that rule. They open the ADOPTER, untick
 * `IsApproved`... no, wait: they complete the adoption first and untick afterwards, and now the
 * shelter's records show a completed adoption to a family it never approved.
 *
 * Same shape as module 6's housing rules exactly: refuse to over-fill a unit, and the user lowers
 * the unit's capacity instead. The invariant spans two entities, so it has to be enforced on
 * whichever one is being mutated — which means writing it twice, on purpose.
 *
 * ## Why the two rules below scope differently, and why that is not an inconsistency
 *
 * Approval is guarded only against **Approved-but-not-yet-completed** adoptions; deactivation is
 * guarded against **any open inquiry**. That mirrors module 6's deliberately-disagreeing Breed pair:
 *
 *   - Revoking approval is a real, legitimate act — a reference comes back bad, a home visit fails.
 *     It must stay possible. What it must not do is silently invalidate a placement the shelter has
 *     already promised, so it is blocked only where a promise is outstanding.
 *   - Deactivating is administrative tidying, and there is never a reason to tidy away a family the
 *     shelter is in the middle of talking to. Any live conversation blocks it.
 *
 * A completed adoption blocks neither. It is history, and history is not supposed to constrain what
 * the record can become — the family can be deactivated years later and the adoption still happened.
 */
@RegisterClass(BaseEntity, 'MJ: Adopters')
export class MJAdopterEntityServer extends MJAdopterEntityExtended {
    /** Opt in. The base default is `true`, i.e. skip — see `MJAnimalEntityServer`'s class note. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        await Promise.all([
            this.validateApprovalNotRevokedUnderPromise(result),
            this.validateNotDeactivatedWhileInConversation(result),
        ]);

        return ShelterFinalize(result);
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    /**
     * Approval cannot be withdrawn while an adoption stands Approved and waiting to complete.
     *
     * Close or deny the outstanding adoption first. Forcing that order means the reversal is recorded
     * against the adoption it actually affects, where the family can be told about it, instead of
     * silently changing what a promise meant after the fact.
     */
    private async validateApprovalNotRevokedUnderPromise(result: ValidationResult): Promise<void> {
        if (!this.IsSaved) return;
        if (!ShelterIsNewOrDirty(this, 'IsApproved')) return;
        if (this.IsApproved) return; // granting approval is always fine

        const promised = await ShelterCountRows(
            this,
            'MJ: Adoptions',
            `AdopterID = '${this.ID}' AND Status = 'Approved'`,
        );
        if (!promised.ok) return ShelterUnverified(result, 'IsApproved', "this family's adoptions");

        if (promised.count > 0) {
            ShelterFail(
                result,
                'IsApproved',
                `This family has ${promised.count} approved adoption${promised.count === 1 ? '' : 's'} ` +
                    `waiting to complete. Deny or cancel ${promised.count === 1 ? 'it' : 'those'} first — ` +
                    `withdrawing approval underneath a placement the shelter has already promised leaves ` +
                    `no record of what changed.`,
                this.IsApproved,
            );
        }
    }

    /**
     * An adopter cannot be retired while the shelter is still in conversation with them.
     *
     * The exact parallel of module 6's "a housing unit cannot be taken out of service while it is
     * occupied": soft-retirement is for records nothing depends on any more.
     */
    private async validateNotDeactivatedWhileInConversation(result: ValidationResult): Promise<void> {
        if (!this.IsSaved) return;
        if (!ShelterIsNewOrDirty(this, 'IsActive')) return;
        if (this.IsActive) return; // reactivating is always fine

        const open = await ShelterCountRows(
            this,
            'MJ: Adoptions',
            `AdopterID = '${this.ID}' AND Status NOT IN ('Completed', 'Withdrawn', 'Denied', 'Cancelled')`,
        );
        if (!open.ok) return ShelterUnverified(result, 'IsActive', "this family's open inquiries");

        if (open.count > 0) {
            ShelterFail(
                result,
                'IsActive',
                `This family has ${open.count} open ${open.count === 1 ? 'inquiry' : 'inquiries'} in progress ` +
                    `and cannot be deactivated yet. Close ${open.count === 1 ? 'it' : 'them'} first — completed ` +
                    `adoptions do not block this, only live ones.`,
                this.IsActive,
            );
        }
    }
}
