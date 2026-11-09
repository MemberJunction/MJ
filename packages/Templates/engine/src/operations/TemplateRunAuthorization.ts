/**
 * @fileoverview Decides who may render a stored template on demand, through the `RunTemplate`
 * mutation or the `Template.Run` remote operation.
 * @module @memberjunction/templates
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** The entities a template run reads: the template, and the content it renders. */
const TEMPLATE_RUN_ENTITIES = ['MJ: Templates', 'MJ: Template Contents'];

/**
 * Checks whether a principal may render a stored template on demand. A run is refused for:
 * - a missing principal
 * - a scope-limited session (an anonymous magic-link or widget guest, or a resource-scoped
 *   magic-link session), whose confinement exists only as row-level security on entity reads
 * - a principal without read permission on `MJ: Templates` and `MJ: Template Contents`
 *
 * Row-level security on the requested template still applies when the caller loads it.
 * @param user the acting principal
 * @param metadata the source of entity permissions; a missing provider refuses the run
 * @returns `null` when the run may proceed, otherwise the reason it is refused
 */
export function GetTemplateRunRefusal(
    user: UserInfo | null | undefined,
    metadata: Pick<IMetadataProvider, 'EntityByName'> | null | undefined,
): string | null {
    if (!user) {
        return 'Unable to determine current user';
    }
    if (isScopeLimited(user)) {
        return 'Running templates is not permitted for scope-limited sessions';
    }
    for (const entityName of TEMPLATE_RUN_ENTITIES) {
        if (!metadata?.EntityByName(entityName)?.GetUserPermisions(user)?.CanRead) {
            return `You do not have permission to read ${entityName}`;
        }
    }
    return null;
}

/**
 * True for a session confined by per-session scope rather than by its roles. Matches
 * `IsScopeLimitedPrincipal` in `@memberjunction/server`, which this package cannot import.
 */
function isScopeLimited(user: UserInfo): boolean {
    const scope = user.MagicLinkScope;
    return user.IsMagicLinkAnonymous || !!(scope?.ResourceID || scope?.ResourceType);
}
