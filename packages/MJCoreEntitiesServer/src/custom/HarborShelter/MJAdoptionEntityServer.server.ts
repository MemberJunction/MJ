import { BaseEntity, EntitySaveOptions, IMetadataProvider, RunInEntityTransaction, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAdoptionEntityExtended, MJAnimalEntityExtended, ShelterFail, ShelterFinalize } from '@memberjunction/core-entities';
import { ShelterCountRows, ShelterIsNewOrDirty, ShelterReadOne, ShelterUnverified } from './shelter-validation.helpers';

/** Statuses meaning the adoption is still live. Anything else is closed. */
const OPEN_SQL = `Status NOT IN ('Completed', 'Withdrawn', 'Denied', 'Cancelled')`;

/**
 * MJ Academy — `MJ: Adoptions`, the rules that need to look at OTHER records, and the side effect
 * that completing one has on the animal.
 *
 * Extends `MJAdoptionEntityExtended`, so the funnel state machine and the date rules are inherited
 * and still run here. This class adds only what a single record cannot answer.
 *
 * ## Why an adoption is where the cross-entity rules concentrate
 *
 * Module 6's lesson was that an invariant spanning two entities must be enforced on whichever one is
 * being mutated. Adoption is the first entity in this app that spans THREE: itself, the animal and
 * the adopter. Completing one asserts something about all three at once, and nothing in the schema
 * can express it — the foreign keys guarantee that an animal and an adopter EXIST, and say nothing
 * about what state they are in.
 */
@RegisterClass(BaseEntity, 'MJ: Adoptions')
export class MJAdoptionEntityServer extends MJAdoptionEntityExtended {
    /** Opt in. The base default is `true`, i.e. skip — see `MJAnimalEntityServer`'s class note. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        await Promise.all([
            this.validateAnimalIsAvailableToComplete(result),
            this.validateAdopterIsApprovedToComplete(result),
            this.validateNoDuplicateOpenInquiry(result),
        ]);

        return ShelterFinalize(result);
    }

    /**
     * Completing an adoption ALSO adopts out the animal, and both writes land together or not at all.
     *
     * ## Why this is a `Save` override rather than another validation rule
     *
     * Validation answers "may this be written?". This is a consequence: "because this was written,
     * something else must be too." Those are different jobs, and putting a write inside
     * `ValidateAsync` would fire it on a save that later fails.
     *
     * ## Why it calls `MarkAdopted()` instead of setting the fields
     *
     * Module 6 built `MarkAdopted()` precisely so that `Status = 'Adopted'` and releasing the kennel
     * happen together — an adopted animal still holding a unit is a bug module 6 has a rule against,
     * and the animal's own `Validate()` would refuse this save if we set the status alone. The seam
     * was built one module ago; this is the caller it was built for. Reimplementing the two lines
     * here is how the kennel eventually gets left occupied.
     *
     * ## Why the transaction
     *
     * Two rows change in two tables. Without a scope, a failure on the animal's save leaves an
     * adoption marked Completed for an animal still sitting in a kennel, listed Available, that
     * someone else can adopt. `RunInEntityTransaction` starts a transaction or JOINS one already in
     * flight — so this composes if a caller is already inside one — and a throw inside rolls back
     * everything, including the adoption row written a few lines earlier.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // True for a transition INTO Completed, and for a record created directly as Completed
        // (a walk-in adoption, entered after the fact). False for re-saving one already complete.
        const alreadyCompleted = this.IsSaved && this.GetFieldByName('Status')?.OldValue === 'Completed';
        if (this.Status !== 'Completed' || alreadyCompleted) {
            return super.Save(options);
        }

        const animalID = this.AnimalID;
        return RunInEntityTransaction(this.ProviderToUse, async () => {
            if (!(await super.Save(options))) return false;

            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const animal = await md.GetEntityObject<MJAnimalEntityExtended>('MJ: Animals', this.ContextCurrentUser);
            if (!(await animal.Load(animalID))) {
                // A throw, not a false: we are inside a scope, and returning false would COMMIT the
                // adoption we just wrote while leaving the animal untouched.
                throw new Error(`Adoption completed, but its animal (${animalID}) could not be loaded to mark it Adopted.`);
            }

            animal.MarkAdopted();
            if (!(await animal.Save())) {
                throw new Error(
                    `Adoption completed, but the animal could not be marked Adopted: ` +
                        `${animal.LatestResult?.Message ?? 'no message returned'}`,
                );
            }
            return true;
        });
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    /**
     * An adoption can only complete for an animal that is actually available to leave.
     *
     * The interesting case is the second family. Two households can both have an open inquiry on the
     * same dog — that is normal, and the funnel is built for it. The moment one completes, the animal
     * becomes Adopted, and this rule is what stops the other one completing too. No unique constraint
     * could express that, because the table it would have to constrain is a different one.
     */
    private async validateAnimalIsAvailableToComplete(result: ValidationResult): Promise<void> {
        if (this.Status !== 'Completed') return;
        if (!ShelterIsNewOrDirty(this, 'Status', 'AnimalID')) return;

        const read = await ShelterReadOne<{ ID: string; Name: string; Status: string }>(
            this,
            'MJ: Animals',
            `ID = '${this.AnimalID}'`,
            ['ID', 'Name', 'Status'],
        );
        if (!read.ok) return ShelterUnverified(result, 'Status', "this adoption's animal");
        // A missing animal is the foreign key's job to reject, not ours.
        const animal = read.row;
        if (!animal) return;

        if (animal.Status !== 'Available') {
            ShelterFail(
                result,
                'Status',
                `${animal.Name} is ${animal.Status}, not Available, so this adoption cannot be completed. ` +
                    (animal.Status === 'Adopted'
                        ? 'This animal has already been adopted — close this inquiry as Withdrawn or Cancelled.'
                        : 'List the animal as Available first.'),
                this.Status,
            );
        }
    }

    /**
     * An adoption can only complete for a screened adopter.
     *
     * `IsApproved` lives on the adopter rather than on the adoption because approval is a property of
     * the FAMILY and is reused across every inquiry they make. That is the whole argument for
     * `Adopter` being its own entity — and this rule is where the argument pays off, since screening
     * a family once protects every animal they ask about.
     */
    private async validateAdopterIsApprovedToComplete(result: ValidationResult): Promise<void> {
        if (this.Status !== 'Completed') return;
        if (!ShelterIsNewOrDirty(this, 'Status', 'AdopterID')) return;

        const read = await ShelterReadOne<{ ID: string; FirstName: string; LastName: string; IsApproved: boolean }>(
            this,
            'MJ: Adopters',
            `ID = '${this.AdopterID}'`,
            ['ID', 'FirstName', 'LastName', 'IsApproved'],
        );
        if (!read.ok) return ShelterUnverified(result, 'Status', "this adoption's adopter");
        const adopter = read.row;
        if (!adopter) return;

        if (!adopter.IsApproved) {
            ShelterFail(
                result,
                'Status',
                `${adopter.FirstName} ${adopter.LastName} has not passed screening, so this adoption cannot ` +
                    `be completed. Approve the adopter first, or record this inquiry as Denied.`,
                this.Status,
            );
        }
    }

    /**
     * One family cannot have two live inquiries about the same animal.
     *
     * A second open row is duplicate paperwork rather than a second intention, and it splits the
     * history of one conversation across two records. CLOSED rows are deliberately not counted: a
     * family that withdrew in March and asks again in September is a genuine new inquiry, and
     * blocking that would make the funnel unusable.
     *
     * This is the shape no constraint can hold. A unique index on (AnimalID, AdopterID) would forbid
     * the September inquiry too; a FILTERED unique index could express "at most one open row", but
     * only by hard-coding the four closed statuses into the index definition, so adding a fifth exit
     * later would silently stop enforcing it.
     */
    private async validateNoDuplicateOpenInquiry(result: ValidationResult): Promise<void> {
        // Only meaningful while this row itself is open.
        if (!ShelterIsNewOrDirty(this, 'Status', 'AnimalID', 'AdopterID')) return;
        if (['Completed', 'Withdrawn', 'Denied', 'Cancelled'].includes(this.Status)) return;

        // Exclude THIS row, or every edit of an open inquiry would find itself and refuse.
        const others = await ShelterCountRows(
            this,
            'MJ: Adoptions',
            `AnimalID = '${this.AnimalID}' AND AdopterID = '${this.AdopterID}' AND ${OPEN_SQL}` +
                (this.IsSaved ? ` AND ID <> '${this.ID}'` : ''),
        );
        if (!others.ok) return ShelterUnverified(result, 'AdopterID', 'this family\'s other inquiries');

        if (others.count > 0) {
            ShelterFail(
                result,
                'AdopterID',
                'This family already has an open inquiry about this animal. Continue that one rather than ' +
                    'starting a second — two live records for one conversation split its history.',
                this.AdopterID,
            );
        }
    }
}
