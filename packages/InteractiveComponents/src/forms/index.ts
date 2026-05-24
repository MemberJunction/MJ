/**
 * Form-role contract for components that declare `componentRole: 'form'`.
 *
 * Three small pieces, kept on a subpath so the generic IC package stays clean:
 *   - `FormHostProps` — what the host passes the component
 *   - `FormEventNames` + typed arg interfaces — events the component emits
 *   - `FormMethodNames` + arg types — methods the component registers
 *
 * Hand-written, Studio-built, and agent-generated form components all target
 * this contract. Import via the subpath:
 *
 *     import { FormHostProps, FormEventNames, FormMethodNames }
 *         from '@memberjunction/interactive-component-types/forms';
 *
 * Note: this is the npm package name — the plan doc shorthands it as
 * `@memberjunction/interactivecomponents`, which is the directory name, not
 * the published name.
 */

export * from './form-host-props';
export * from './form-event-names';
export * from './form-method-names';
export * from './curated-form-schema';
export * from './default-form-scaffold';
export * from './form-host-props-fixture';

import type { ComponentSpec } from '../component-spec';

/** True iff the spec commits to the form-role contract. */
export function isFormRole(spec: Pick<ComponentSpec, 'componentRole'>): boolean {
    return spec.componentRole === 'form';
}
