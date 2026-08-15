/**
 * Optional last-wins chrome override. Apps register a subclass with
 * `@RegisterClassEx(BaseFormPolicy, { metadata: { entity } })`. The container
 * asks the winning policy how to arrange contributions — the policy does not
 * own panels.
 *
 * Return `null` to keep the metadata/ranker default.
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
     * Return a full chrome spec to replace the metadata default, or `null`
     * to keep the ranker/layout the container already computed.
     */
    public ResolveChrome(_ctx: FormChromeContext): FormChromeSpec | null {
        return null;
    }
}
