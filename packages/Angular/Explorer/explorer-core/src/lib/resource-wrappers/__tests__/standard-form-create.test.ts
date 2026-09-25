/**
 * "New in standard form" on an entity view (MJ#4755). The button exists so a
 * user can create a record in the CodeGen form when a custom form hides it —
 * e.g. a custom form that only supports existing records. It must never show
 * for the common case (only the generated form) or for a user who can't create.
 */
// ng-base-forms ships partial-compiled Angular classes — load the JIT compiler
// first (same convention as the other component-importing suites here).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { BaseFormComponent, FormResolution } from '@memberjunction/ng-base-forms';
import { ShouldOfferStandardFormCreate } from '../standard-form-create';

// Dummy form classes: only their identity matters to the resolution.
class GeneratedForm extends BaseFormComponent {}
class CustomForm extends BaseFormComponent {}

/** A custom class form registered above the generated one. */
const customHidesStandard: FormResolution = { kind: 'class', subClass: CustomForm, variants: [], standard: GeneratedForm };
/** The common case: the generated form is the only registration. */
const standardOnly: FormResolution = { kind: 'class', subClass: GeneratedForm, variants: [], standard: GeneratedForm };

describe('ShouldOfferStandardFormCreate', () => {
  it('offers it when a custom form hides the standard one and the user can create', () => {
    expect(ShouldOfferStandardFormCreate(customHidesStandard, true)).toBe(true);
  });

  it('does not offer it when the user cannot create, even with a custom form', () => {
    expect(ShouldOfferStandardFormCreate(customHidesStandard, false)).toBe(false);
  });

  it('does not offer it when the standard form is already the one in use', () => {
    // "New Record" already opens the standard form — a second button would be noise.
    expect(ShouldOfferStandardFormCreate(standardOnly, true)).toBe(false);
  });

  it('does not offer it when neither condition holds', () => {
    expect(ShouldOfferStandardFormCreate(standardOnly, false)).toBe(false);
  });
});
