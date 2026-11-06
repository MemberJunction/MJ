import { FormResolution, HasStandardFormAlternative } from '@memberjunction/ng-base-forms';

/** Offer "New in standard form" only when a custom form hides the standard one AND the user may create. */
export function ShouldOfferStandardFormCreate(resolution: FormResolution, canCreate: boolean): boolean {
  return canCreate && HasStandardFormAlternative(resolution);
}
