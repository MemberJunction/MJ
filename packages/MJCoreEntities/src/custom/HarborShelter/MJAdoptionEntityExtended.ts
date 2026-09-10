import { BaseEntity, EntitySaveOptions, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAdoptionEntity } from '../../generated/entity_subclasses';
import { ShelterDayValue, ShelterFail, ShelterFinalize, ShelterTodayUTC } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Adoptions`, the funnel's record-only rules.
 *
 * ## The state machine module 6 could not have
 *
 * Module 6 dropped its status-transition section, and for a good reason: `Animal.Status` genuinely
 * has no illegal moves. An adopted animal really can come back and be listed Available again;
 * returns happen, and an app that forbids them is wrong about shelters.
 *
 * `Adoption.Status` is the opposite case, and it is why the state machine belongs here instead:
 *
 *      Inquiry ──▶ Screening ──▶ Approved ──▶ Completed
 *         │            │             │
 *         └────────────┴─────────────┴──────▶ Withdrawn │ Denied │ Cancelled
 *
 * Forward along the ladder, or out one of the three exits, from any open state. Never backwards, and
 * never out of a closed one. Skipping forward IS allowed — a walk-in adoption can be screened,
 * approved and completed in one afternoon, and a rule that forced four separate saves would be
 * modelling paperwork rather than reality.
 *
 * ## Why this is record-only, and therefore in the SHARED package
 *
 * The rule compares the status being written against the status already stored — `Value` versus
 * `OldValue` on the same field of the same row. Both are in hand; nothing is read. So it lives here
 * and runs in the browser, and a staff member picking an illegal status sees why immediately,
 * on the field, before saving.
 *
 * ## The deliberate strictness, and the one line that relaxes it
 *
 * A closed adoption is final: `Completed`, `Withdrawn`, `Denied` and `Cancelled` accept no further
 * change. A completed adoption is permanent history — if the animal comes back, that is a new intake
 * on the animal, not an un-completing of the past. The cost is that a mis-keyed close cannot be
 * corrected in place; the fix is a fresh inquiry, with the wrong record left standing as the audit
 * trail says it happened.
 *
 * That is arguable, and a shelter might well want the opposite. Removing `CLOSED` from the guard in
 * `validateStatusTransition` is the whole change — deliberately one line, like module 6's two
 * Breed rules that disagree with each other on purpose.
 *
 * ## What is absent because the database already has it
 *
 *   - `Completed` requires a `CompletedDate` — `CK_Adoption_Completed_Requires_Date`
 *   - `Denied` requires a `DenialReason` — `CK_Adoption_Denied_Requires_Reason`
 *   - `CompletedDate >= InquiryDate`, `Fee >= 0`, and the `Status` value list
 *
 * CodeGen turns each of those check constraints into a generated validator inside `Validate()`, so
 * `super.Validate()` is what keeps them. Re-implementing them here would be two sources of truth for
 * one rule, and the copy in TypeScript is the one that rots.
 */
@RegisterClass(BaseEntity, 'MJ: Adoptions')
export class MJAdoptionEntityExtended extends MJAdoptionEntity {
    /** The forward-only ladder, in order. Index is the rung. */
    private static readonly LADDER: ReadonlyArray<string> = ['Inquiry', 'Screening', 'Approved', 'Completed'];

    /** Terminal states. Reachable from any open state; nothing is reachable FROM them. */
    private static readonly CLOSED: ReadonlyArray<string> = ['Completed', 'Withdrawn', 'Denied', 'Cancelled'];

    /** The three ways an adoption ends without the animal being placed. */
    private static readonly EXITS: ReadonlyArray<string> = ['Withdrawn', 'Denied', 'Cancelled'];

    public override Validate(): ValidationResult {
        // super FIRST: it carries every CodeGen-generated check-constraint validator.
        const result = super.Validate();

        this.validateStatusTransition(result);
        this.validateInquiryDateNotFuture(result);
        this.validateCompletedDateNotFuture(result);

        return ShelterFinalize(result);
    }

    /**
     * Stamp `CompletedDate` when the adoption completes without one.
     *
     * A derived value, not a rule — the kind of thing a `Save` override is for. The check constraint
     * REQUIRES a date whenever `Status` is `'Completed'`, so without this a staff member who moves
     * the status and forgets the date gets a constraint violation instead of the obvious default.
     * Deriving it is strictly kinder than rejecting it.
     *
     * `super.Save()` is called last, not first: the value has to be on the record before it is
     * written. Compare `Validate()`, where `super` goes first because it is contributing to a result
     * this method then adds to.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.Status === 'Completed' && !this.CompletedDate) {
            this.CompletedDate = new Date();
        }
        return super.Save(options);
    }

    /**
     * Forward along the ladder, or out an exit — never backwards, never out of a closed state.
     */
    private validateStatusTransition(result: ValidationResult): void {
        // A brand-new record has no previous state to move away from. Its Status is whatever it was
        // created as, and the value list is the database's business.
        if (!this.IsSaved) return;

        const field = this.GetFieldByName('Status');
        if (!field?.Dirty) return;

        const from = field.OldValue as string | null;
        const to = this.Status;
        if (!from || !to || from === to) return;

        if (MJAdoptionEntityExtended.CLOSED.includes(from)) {
            ShelterFail(
                result,
                'Status',
                `This adoption is already ${from}, which is final — it cannot be changed to ${to}. ` +
                    `If the family is interested again, record a new inquiry rather than reopening this one.`,
                to,
            );
            return;
        }

        // Any exit is available while the adoption is still open.
        if (MJAdoptionEntityExtended.EXITS.includes(to)) return;

        const fromRung = MJAdoptionEntityExtended.LADDER.indexOf(from);
        const toRung = MJAdoptionEntityExtended.LADDER.indexOf(to);
        if (fromRung >= 0 && toRung > fromRung) return;

        ShelterFail(
            result,
            'Status',
            `An adoption cannot move from ${from} back to ${to}. The stages only run forwards ` +
                `(Inquiry, Screening, Approved, Completed); to stop this adoption, set it to ` +
                `Withdrawn, Denied or Cancelled instead.`,
            to,
        );
    }

    /** A family cannot have asked about an animal tomorrow. */
    private validateInquiryDateNotFuture(result: ValidationResult): void {
        const day = ShelterDayValue(this.InquiryDate);
        if (day !== null && day > ShelterTodayUTC()) {
            ShelterFail(result, 'InquiryDate', 'The inquiry date cannot be in the future.', this.InquiryDate);
        }
    }

    /**
     * An adoption cannot have completed tomorrow either.
     *
     * The check constraint already enforces `CompletedDate >= InquiryDate`, which catches a date
     * BEFORE the inquiry. It says nothing about a date after today, because a constraint cannot
     * reference the current date without becoming non-deterministic — so this half of the rule has
     * to live in code. That split is worth noticing: the database took the part it could hold.
     */
    private validateCompletedDateNotFuture(result: ValidationResult): void {
        const day = ShelterDayValue(this.CompletedDate);
        if (day !== null && day > ShelterTodayUTC()) {
            ShelterFail(result, 'CompletedDate', 'The completion date cannot be in the future.', this.CompletedDate);
        }
    }
}
