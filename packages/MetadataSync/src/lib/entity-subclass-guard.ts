/**
 * Detects the silent failure behind issue #4199: `Metadata.GetEntityObject` never fails when no
 * subclass is registered for an entity — the ClassFactory hands back a plain `BaseEntity`, which
 * saves fine through the generated stored procedures and simply skips every custom `Save()`
 * override, validation rule and lifecycle hook the entity's real class carries. In a push that
 * looks identical to success. This guard names it, once per entity per process.
 */
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

const warned = new Set<string>();

/**
 * Returns a warning when no `BaseEntity` subclass is registered for `entityName` in this
 * process, or `null` when one is. Each entity is reported once; later calls return `null`.
 */
export function describeMissingEntitySubclass(entityName: string): string | null {
  const key = entityName.trim().toLowerCase();
  if (!key || warned.has(key)) {
    return null;
  }
  const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
  if (registration) {
    return null;
  }
  warned.add(key);
  return (
    `No entity subclass is registered for '${entityName}' in this process — records will be written with the ` +
    `generic BaseEntity, so the entity's custom validation, Save() logic and lifecycle hooks will NOT run. ` +
    `If this entity belongs to an Open App, make sure the app's server package is installed (mj app install) ` +
    `and listed in mj.config.cjs dynamicPackages.server, and that this run was not started with ` +
    `--no-app-packages / MJ_DYNAMIC_PACKAGES=none.`
  );
}

/** Test seam: forget which entities have been reported. */
export function resetMissingEntitySubclassWarnings(): void {
  warned.clear();
}
