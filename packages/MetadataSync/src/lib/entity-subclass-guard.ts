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
export function describeMissingEntitySubclass(entityName: string, options: { dryRun?: boolean } = {}): string | null {
  const key = entityName.trim().toLowerCase();
  if (!key || warned.has(key)) {
    return null;
  }
  const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
  if (registration) {
    return null;
  }
  warned.add(key);
  const verb = options.dryRun ? 'would be written' : 'will be written';
  return (
    `No entity subclass is registered for '${entityName}' in this process — records ${verb} with the ` +
    `generic BaseEntity, so any custom validation, Save() logic or lifecycle hooks the entity's own class carries ` +
    `will NOT run. The class is loaded from the host's generated entities package (mj.config.cjs ` +
    `codeGeneration.packages.entities) or, for an Open App entity, from the app's server package ` +
    `(mj app install → dynamicPackages.server). Check that the package is installed and built, that its entry ` +
    `is enabled and scoped to this process, and that this run was not started with --no-app-packages / ` +
    `MJ_DYNAMIC_PACKAGES=none. See guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md.`
  );
}

/** Test seam: forget which entities have been reported. */
export function resetMissingEntitySubclassWarnings(): void {
  warned.clear();
}
