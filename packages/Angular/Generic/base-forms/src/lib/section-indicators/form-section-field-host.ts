import { InjectionToken } from '@angular/core';
import type { MjFormFieldComponent } from '../field/form-field.component';

/**
 * The section a form field sits inside, reached through the element injector rather than a
 * content query.
 *
 * `mj-collapsible-panel` derives a section's state (unsaved edits, invalid or required-and-empty
 * fields, which validation failures it owns, whether it has anything to show) from its
 * `mj-form-field`s. It used to find them with `@ContentChildren` alone, and a content query stops
 * at a component view boundary: a field declared inside a widget component's own template, with
 * the widget projected into the panel, was invisible to the section. Such a section reported no
 * required-and-empty count before a save and claimed none of the field-named errors a failed save
 * published, so the rail never badged it even while its fields sat red.
 *
 * The element injector follows the element tree across those boundaries, so a field can find the
 * panel it renders inside no matter how many component views sit between them. The panel provides
 * itself under {@link FORM_SECTION_FIELD_HOST}; every `mj-form-field` injects the token optionally
 * and registers on construction, so a field rendered outside any section is simply unregistered.
 */
export interface FormSectionFieldHost {
  /** Declare a field that renders inside this section. Idempotent for the same instance. */
  RegisterField(field: MjFormFieldComponent): void;
  /** Withdraw a field on destroy. A field never registered is ignored. */
  UnregisterField(field: MjFormFieldComponent): void;
  /**
   * A registered field's inputs changed (`EditMode`, `Record`, `FormContext`, …), so its state
   * as the section reads it may have too.
   *
   * Why the section has to be TOLD, when a projected field never tells it anything: a projected
   * field's inputs are bound in the same view as the section's own host bindings, and Angular
   * evaluates a view's template bindings before its host bindings, so the section always reads a
   * projected field after that field was updated. A field inside a child component's view is
   * refreshed AFTER the section's host bindings and after the rail that reads the section, so
   * anything derived from its inputs would be one pass stale — or, in dev mode, an
   * `ExpressionChangedAfterItHasBeenChecked` error. The host records the change in a signal its
   * readers depend on, which makes Angular re-run those views before its no-changes check.
   */
  NotifyFieldChanged(field: MjFormFieldComponent): void;
}

export const FORM_SECTION_FIELD_HOST = new InjectionToken<FormSectionFieldHost>('FORM_SECTION_FIELD_HOST');
