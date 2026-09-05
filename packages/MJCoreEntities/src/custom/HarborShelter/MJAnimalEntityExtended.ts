import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAnimalEntity } from '../../generated/entity_subclasses';
import { ShelterDayValue, ShelterFail, ShelterFinalize, ShelterTodayUTC } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Animals`, the rules that are decidable from the record alone.
 *
 * WHY THIS LIVES IN core-entities AND NOT core-entities-server. This package ships to the browser
 * as well as the server, so a `Validate()` override here runs in BOTH. That matters: `mj-form-field`
 * calls `Record.Validate()` on every edit and filters the result to its own field by the error's
 * `Source`, so every rule below appears inline on the form as the user types, with no form code and
 * no round-trip. Put a record-only rule on the server class instead and the user waits for a failed
 * save to learn something the browser already knew.
 *
 * The server class (`MJAnimalEntityServer`) EXTENDS this one, so the rules are not lost server-side --
 * they are inherited, and the server adds only the checks that need a database read.
 *
 * WHAT IS DELIBERATELY ABSENT, because the schema already enforces it:
 *   - `WeightKg > 0` -- a CHECK constraint, and CodeGen already emitted
 *     `ValidateWeightKgGreaterThanZero` into the generated `Validate()`. Calling `super.Validate()`
 *     first is what keeps it; a subclass that builds a fresh ValidationResult would silently drop
 *     every generated validator.
 *   - Value lists (`Species`, `Sex`, `IntakeReason`, `Status`) -- CHECK constraints, and the form
 *     renders them as pick lists so an invalid value cannot be typed.
 *   - `MicrochipNumber` uniqueness -- `UQ_Animal_MicrochipNumber`. The database is the only place
 *     that can enforce it without a race, and MJ surfaces the violation through `LatestResult`.
 *   - Microchip FORMAT is not checked at all: ISO 11784/11785 chips are 15 digits, but older AVID
 *     and pre-ISO US chips are 9 or 10, and some are alphanumeric. A format rule would reject
 *     animals that really are chipped.
 */
@RegisterClass(BaseEntity, 'MJ: Animals')
export class MJAnimalEntityExtended extends MJAnimalEntity {
    /** A data URI for an image, which is what the photo control writes. */
    private static readonly IMAGE_DATA_URI = /^data:image\/[a-z0-9.+-]+;base64,/i;

    /** Statuses meaning the animal has left the shelter and cannot be occupying a unit. */
    private static readonly GONE_STATUSES: ReadonlyArray<string> = ['Adopted', 'Transferred'];

    public override Validate(): ValidationResult {
        // super FIRST: it carries the CodeGen-generated field validators. Replacing the result
        // instead of extending it is the classic way to silently lose them.
        const result = super.Validate();

        this.validateNamePresent(result);
        this.validateIntakeDateNotFuture(result);
        this.validateBirthDate(result);
        this.validatePhotoIsDataUri(result);
        this.validateDepartedAnimalHasNoHousing(result);

        return ShelterFinalize(result);
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    /** NOT NULL does not stop an empty or whitespace-only string, and a nameless animal is unusable. */
    private validateNamePresent(result: ValidationResult): void {
        if (!this.Name || this.Name.trim().length === 0) {
            ShelterFail(result, 'Name', 'Every animal needs a name — use a placeholder like "Stray 214" if it is unknown.', this.Name);
        }
    }

    /** You cannot have taken in an animal that has not arrived yet. */
    private validateIntakeDateNotFuture(result: ValidationResult): void {
        const intake = ShelterDayValue(this.IntakeDate);
        if (intake !== null && intake > ShelterTodayUTC()) {
            ShelterFail(result, 'IntakeDate', 'Intake date cannot be in the future.', this.IntakeDate);
        }
    }

    /**
     * TWO rules on one field, and the second is the interesting one: an animal cannot be born
     * after it arrived. That is a CROSS-FIELD check -- it is decidable from this record alone, but
     * not from either column in isolation, which is exactly why a CHECK constraint across two
     * nullable columns would be awkward and why it belongs here.
     */
    private validateBirthDate(result: ValidationResult): void {
        const birth = ShelterDayValue(this.EstimatedBirthDate);
        if (birth === null) return;

        if (birth > ShelterTodayUTC()) {
            ShelterFail(result, 'EstimatedBirthDate', 'Estimated birth date cannot be in the future.', this.EstimatedBirthDate);
            return;
        }
        const intake = ShelterDayValue(this.IntakeDate);
        if (intake !== null && birth > intake) {
            ShelterFail(
                result,
                'EstimatedBirthDate',
                'Estimated birth date is after the intake date — an animal cannot be born after it arrived.',
                this.EstimatedBirthDate,
            );
        }
    }

    /** The column holds a complete data URI, not a bare base64 payload or a file path. */
    private validatePhotoIsDataUri(result: ValidationResult): void {
        const photo = this.PhotoBase64;
        if (!photo || photo.length === 0) return;
        if (!MJAnimalEntityExtended.IMAGE_DATA_URI.test(photo)) {
            ShelterFail(
                result,
                'PhotoBase64',
                'Photo must be a complete image data URI, starting with "data:image/…;base64,".',
                null, // never echo the payload back into an error message
            );
        }
    }

    /**
     * An adopted or transferred animal has left the building and must not still hold a kennel.
     *
     * This is the rule with the most operational bite: a departed animal left pointing at a unit
     * makes that unit read as occupied, so occupancy is overstated and staff cannot place a new
     * arrival. `MarkAdopted()` / `MarkTransferred()` below satisfy it by construction; this check
     * catches every other path, including a direct API write.
     */
    private validateDepartedAnimalHasNoHousing(result: ValidationResult): void {
        if (!MJAnimalEntityExtended.GONE_STATUSES.includes(this.Status)) return;
        if (!this.HousingID) return;
        ShelterFail(
            result,
            'HousingID',
            `An animal marked ${this.Status} cannot still be assigned to housing — clear the housing first, or use Mark ${this.Status}.`,
            this.HousingID,
        );
    }

    // ── Domain methods ───────────────────────────────────────────────────────

    /**
     * Adopt the animal out: set the status AND release the unit, in one call.
     *
     * A method rather than a silent fix inside `Save()`. Auto-correcting on save would make the
     * validation above unreachable and would quietly change a field the caller did not ask to
     * change; an explicit verb keeps both honest. Callers still Save() afterwards.
     */
    public MarkAdopted(): void {
        this.Status = 'Adopted';
        this.HousingID = null;
    }

    /** Transfer the animal to another organisation, releasing the unit. See MarkAdopted(). */
    public MarkTransferred(): void {
        this.Status = 'Transferred';
        this.HousingID = null;
    }

}
