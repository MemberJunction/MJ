/**
 * Where a user's choice of form for an entity is stored.
 *
 * A single Active `MJ: Entity Form Overrides` row does not mean the user sees that form.
 * They can pick any of the forms on offer, including the generated one, and that choice is
 * a per-user setting. Anything deciding "is a full custom form rendering here" has to read
 * it, or it answers for the wrong form.
 *
 * Lives here rather than in the Angular resolver so the browser and the server read the
 * same key: they disagreed once, and the server told an agent a form was unreachable while
 * the user was looking at it.
 */

/** `MJ: User Settings` key prefix for the per-entity form choice. */
export const FORM_VARIANT_SETTING_PREFIX = 'mj.formVariant.';

/**
 * Stored when the user explicitly picks the generated form.
 *
 * Distinct from a missing setting, which means "no preference, apply the auto-pick rules".
 * The leading `__` keeps it apart from the override UUIDs stored under the same key.
 */
export const FORM_VARIANT_EXPLICIT_DEFAULT = '__codegen-default__';

/** The settings key for one entity. Lowercased, so case variants collapse onto one row. */
export function FormVariantSettingKey(entityName: string): string {
    return FORM_VARIANT_SETTING_PREFIX + (entityName ?? '').toLowerCase();
}
