import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';

/**
 * MJ Academy — helpers shared by every Harbor Street entity's record-only validation.
 *
 * Free functions rather than a shared base class: each entity must extend its OWN CodeGen-generated
 * class (`MJAnimalEntity`, `MJCareLogEntity`, …), so there is no common ancestor to hang protected
 * methods on. Functions compose where inheritance cannot.
 */

/**
 * Reduce a value to a UTC day number, or null if it is absent/unparseable.
 *
 * Every date on these entities is a SQL DATE, which arrives as an instant at midnight UTC.
 * Comparing one against a local `new Date()` would make a rule depend on the browser's time of day
 * as well as its day, and flip for anyone west of UTC — the same defect MJ #4210 tracks in the
 * read-mode formatter. Reducing both sides to a UTC day first removes the question entirely.
 */
export function ShelterDayValue(d: Date | string | null | undefined): number | null {
    if (d === null || d === undefined) return null;
    const parsed = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

/** Today as a UTC day number, for comparison against ShelterDayValue results. */
export function ShelterTodayUTC(): number {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/**
 * Record a validation failure against a specific FIELD.
 *
 * `Source` MUST be the field name. `mj-form-field` filters the result of `Record.Validate()` by it
 * to decide which control shows the message, so an error with the wrong Source still blocks the
 * save but appears nowhere on the form — which reads to the user as a save that failed silently.
 */
export function ShelterFail(
    result: ValidationResult,
    field: string,
    message: string,
    value: unknown,
): void {
    result.Errors.push(new ValidationErrorInfo(field, message, value, ValidationErrorType.Failure));
    result.Success = false;
}

/**
 * Recompute `Success` from the errors actually present.
 *
 * Call at the end of an override. A caller that only ever sets `Success = false` leaves it wrong if
 * a base class recorded a warning rather than a failure.
 */
export function ShelterFinalize(result: ValidationResult): ValidationResult {
    result.Success = result.Errors.filter((e) => e.Type === ValidationErrorType.Failure).length === 0;
    return result;
}

/**
 * Module 7 — an IS-A subtype must agree with the discriminator on its parent.
 *
 * A `Dog` row may only hang off an `Animal` whose `Species` is `'Dog'`. `Animal.Species` has been
 * the discriminator since module 3; this is what stops the two from disagreeing.
 *
 * ## Why this is a RECORD-ONLY rule, which is the surprising part
 *
 * `Species` lives on the `Animal` table, not on `Dog` — so at first glance this looks like module
 * 6's cross-record shape: "compare a column on this row against a column on the row it points at",
 * which was always `ValidateAsync` and always cost a read.
 *
 * It is not, and the reason is what IS-A *means*. A dog and its animal are not two records that
 * reference each other; they are ONE logical record split across two tables, sharing one primary
 * key. `BaseEntity` routes `dog.Get('Species')` up the parent chain to the object that owns the
 * field, and that object is already in memory — loaded as part of the same `Load()`, saved in the
 * same transaction. There is nothing to fetch.
 *
 * So the module 6 test still works, and still gives the right answer; it is the *record* that got
 * bigger. Ask "can I answer this from this record alone?" and for an IS-A subtype the honest answer
 * includes every field it inherits. That is why this rule can live in the shared package and appear
 * on the form as the user types, while the vaccination rule — a genuinely separate record — cannot.
 *
 * ## Why callers pass `Get('Species')` rather than `dog.Species`
 *
 * Both work identically at runtime -- `BaseEntity.Get` does the same IS-A routing the typed accessor
 * does (`baseEntity.ts`: it forwards to `_parentEntity` when the field belongs to the parent chain).
 * The difference is WHEN each one exists.
 *
 * The typed accessor is emitted by CodeGen, and CodeGen cannot run unless `MJCoreEntities` is
 * already BUILT -- it loads that package's `dist` to read metadata. So a file that says
 * `dog.Species` cannot compile until CodeGen has run, and CodeGen cannot run until it compiles.
 * Measured, not theorised: it took down this very branch, and because CodeGen cleans generated
 * files early and rebuilds in an AFTER command, the failure left `dist` in a WORSE state than
 * before the run:
 *
 *     Error: Cannot find module '.../packages/MJCoreEntities/dist/custom/MJUserViewEntityExtended'
 *
 * A course branch has to build from a clean checkout in one pass, so the rule is: custom entity code
 * reads a not-yet-generated field through `Get()`. Once CodeGen has run, `dog.Species` is available
 * and is what the lesson shows for reading inherited fields -- these two call sites are the
 * exception, and the reason is bootstrapping, not style.
 *
 * ## Why it protects edits from the Animal side too
 *
 * Someone could open the *Animal* form and flip `Species` from Dog to Cat, never touching the Dog
 * record. That would strand the subtype. It is blocked anyway: when a record is loaded at a level
 * that has a subtype, `Save()` **delegates to the leaf**, so saving that Animal runs `Dog.Save()`,
 * which runs this rule. Module 6 had to write each paired rule by hand on both entities; here the
 * pairing falls out of IS-A's save delegation.
 */
export function ShelterValidateSubtypeSpecies(
    species: string | null | undefined,
    expected: 'Dog' | 'Cat',
    result: ValidationResult,
): void {
    // Absent rather than wrong: an unsaved subtype whose parent fields have not been set yet is
    // incomplete, not invalid, and Animal.Species is NOT NULL so the database has the final word.
    if (species === null || species === undefined || species === '') return;
    if (species === expected) return;

    ShelterFail(
        result,
        'Species',
        `This record is a ${expected}, so the animal's species must be ${expected} — it is currently ${species}. ` +
            `An animal cannot be one species and a different subtype.`,
        species,
    );
}
