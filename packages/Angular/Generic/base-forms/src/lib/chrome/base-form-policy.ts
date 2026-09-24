/**
 * Optional last-wins chrome decorator. Apps register a subclass with
 * `@RegisterClassEx(BaseFormPolicy, { metadata: { entity } })`.
 *
 * Downstream subclasses the upstream policy (`OrdersPersonFormPolicy extends
 * CommonPersonFormPolicy`). The policy may rename groups, swap icons, or wrap
 * labels. It MUST NOT add, remove, or re-bucket sections — inclusion is data
 * (L1 / L3). See `plans/form-chrome-layering.md`.
 */
import type { EntityInfo } from '@memberjunction/core';
import type { RelatedFormRoleResolution } from '@memberjunction/core';
import type { FormChromePanelSnapshot, FormChromeSpec } from './form-chrome';

export interface FormChromeContext {
    Entity: EntityInfo;
    RelatedRoles: RelatedFormRoleResolution;
    Panels: FormChromePanelSnapshot[];
    /** First-class section count the default resolver would use for Layout auto. */
    PrimarySectionCount: number;
}

export class BaseFormPolicy {
    /**
     * Cosmetics on an already-resolved spec. Return the same groups/membership.
     */
    public DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        return spec;
    }
}
