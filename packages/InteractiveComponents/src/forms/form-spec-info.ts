/**
 * Small pure helpers for extracting form-binding info from a `ComponentSpec`.
 *
 * The artifact viewer's form-aware branch and the Form Builder dashboard
 * both need to answer "which entity does this form bind to?" — the answer
 * lives in either `spec.entityName` (explicit) or
 * `spec.dataRequirements.entities[0].name` (inferred). Centralizing the
 * resolution rule here means both surfaces produce the same answer and a
 * spec author only has to learn one convention.
 */
import type { ComponentSpec } from '../component-spec';

/**
 * Resolve the entity the form binds to.
 *
 * Lookup order:
 *   1. `spec.entityName` if set (trimmed; empty strings → null)
 *   2. `spec.dataRequirements.entities[0].name` if present
 *   3. `null` — caller decides whether to fall back to a fixture or warn
 */
export function getDeclaredFormEntityName(
    // `entityName` isn't a typed ComponentSpec field — it's an extension some
    // specs carry. Use a structural input that allows it without breaking on
    // strict-mode Pick<>.
    spec: (ComponentSpec & { entityName?: unknown }) | null | undefined,
): string | null {
    if (!spec) return null;
    const direct = (spec as unknown as { entityName?: unknown }).entityName;
    if (typeof direct === 'string' && direct.trim().length > 0) {
        return direct.trim();
    }
    const dr = spec.dataRequirements as unknown as { entities?: Array<{ name?: unknown }> } | undefined;
    const first = dr?.entities?.[0]?.name;
    if (typeof first === 'string' && first.trim().length > 0) {
        return first.trim();
    }
    return null;
}
