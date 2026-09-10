import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAdopterEntity } from '../../generated/entity_subclasses';
import { ShelterFail, ShelterFinalize } from './shelter-validation.helpers';

/**
 * MJ Academy — `MJ: Adopters`, the rules decidable from the record alone.
 *
 * An adopter is the module's example of a plain **related record**: it has its own list, its own
 * form, and it means something on its own. It exists before any particular adoption and outlives
 * every one of them — which is exactly why screening lives here (`IsApproved`) rather than being
 * re-answered on each inquiry.
 *
 * ## What is absent because the database already has it
 *
 *   - `Email` uniqueness — `UQ_Adopter_Email`. Only the database can enforce that without a race:
 *     two staff members entering the same family at the same moment both pass a code check and both
 *     insert. MJ surfaces the violation through `LatestResult`.
 *   - The `HousingType` value list — `CK_Adopter_HousingType`, which CodeGen turned into a generated
 *     validator that `super.Validate()` carries.
 *
 * ## What is deliberately NOT validated
 *
 * `HasYard`, `HasOtherPets` and `HousingType` are screening signals, and every one of them is
 * nullable on purpose: NULL means "not collected yet". An application is filled in over a phone
 * call and a home visit, so requiring them would block saving a half-taken application — which is
 * the only kind that exists while you are on the phone.
 *
 * The matching *rules* those fields feed — whether this family suits a high-energy dog, whether a
 * declawed cat can go to them — belong to the adoption, not to the person, and there is a stretch
 * exercise for exactly that at the end of the module.
 */
@RegisterClass(BaseEntity, 'MJ: Adopters')
export class MJAdopterEntityExtended extends MJAdopterEntity {
    /**
     * Deliberately permissive: something before an `@`, something after it, a dot in the domain, no
     * spaces. Email addresses are far stranger than most patterns admit (quoted locals, new TLDs,
     * plus-addressing, unicode domains), and a strict regex's only reliable achievement is turning
     * away real applicants. The address is verified by sending mail to it, not by inspecting it.
     */
    private static readonly EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    public override Validate(): ValidationResult {
        const result = super.Validate();

        this.validateNamesPresent(result);
        this.validateEmailShape(result);

        return ShelterFinalize(result);
    }

    /**
     * NOT NULL does not stop an empty or whitespace-only string.
     *
     * An adopter with a blank surname is unfindable in the list a staff member searches when the
     * family calls back, and unusable in the adoption history the animal's record shows.
     */
    private validateNamesPresent(result: ValidationResult): void {
        if (!this.FirstName || this.FirstName.trim().length === 0) {
            ShelterFail(result, 'FirstName', 'An adopter needs a first name.', this.FirstName);
        }
        if (!this.LastName || this.LastName.trim().length === 0) {
            ShelterFail(result, 'LastName', 'An adopter needs a last name — it is how staff find them again.', this.LastName);
        }
    }

    private validateEmailShape(result: ValidationResult): void {
        const email = this.Email?.trim() ?? '';
        if (email.length === 0) {
            ShelterFail(result, 'Email', 'An adopter needs an email address — it is how the shelter follows up.', this.Email);
            return;
        }
        if (!MJAdopterEntityExtended.EMAIL.test(email)) {
            ShelterFail(result, 'Email', `"${email}" does not look like an email address.`, this.Email);
        }
    }
}
