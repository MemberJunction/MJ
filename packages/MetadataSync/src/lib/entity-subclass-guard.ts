/**
 * Detects the silent failure behind issue #4199: `Metadata.GetEntityObject` never fails when no
 * subclass is registered for an entity — the ClassFactory hands back a plain `BaseEntity`, which
 * saves fine through the generated stored procedures and simply skips every custom `Save()`
 * override, validation rule and lifecycle hook the entity's real class carries. In a push that
 * looks identical to success. This guard names it, once per entity and operation per process.
 */
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

const warned = new Set<string>();

export interface MissingEntitySubclassOptions {
  dryRun?: boolean;
  /** Which sync operation is about to use the entity; decides how the consequence is described. Default `'push'`. */
  operation?: 'push' | 'pull';
}

/**
 * Returns a warning when no `BaseEntity` subclass is registered for `entityName` in this
 * process, or `null` when one is. Each entity is reported once per operation; later calls return `null`.
 */
export function describeMissingEntitySubclass(entityName: string, options: MissingEntitySubclassOptions = {}): string | null {
  const entityKey = entityName.trim().toLowerCase();
  // Once per operation: a pull warning must not silence the later push warning for the same
  // entity, which describes a different, more serious consequence.
  const key = `${options.operation ?? 'push'}:${entityKey}`;
  if (!entityKey || warned.has(key)) {
    return null;
  }
  const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
  if (registration) {
    return null;
  }
  warned.add(key);
  return (
    `No entity subclass is registered for '${entityName}' in this process — ${describeConsequence(options)} ` +
    `The class is loaded from the host's generated entities package (mj.config.cjs ` +
    `codeGeneration.packages.entities) or, for an Open App entity, from the app's server package ` +
    `(mj app install → dynamicPackages.server). Check that the package is installed and built, that its entry ` +
    `is enabled and scoped to this process, and that this run was not started with --no-app-packages / ` +
    `MJ_DYNAMIC_PACKAGES=none. See guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md.`
  );
}

/** What running without the entity's own class costs, for the operation about to run. */
function describeConsequence(options: MissingEntitySubclassOptions): string {
  if (options.operation === 'pull') {
    const verb = options.dryRun ? 'would be' : 'are';
    return (
      `records ${verb} read through the generic BaseEntity, so values the entity's own class computes ` +
      `(its virtual properties) will be missing from the pulled files.`
    );
  }
  const verb = options.dryRun ? 'would be written' : 'will be written';
  return (
    `records ${verb} with the generic BaseEntity, so any custom validation, Save() logic or lifecycle ` +
    `hooks the entity's own class carries will NOT run.`
  );
}

/** Test seam: forget which entities have been reported. */
export function resetMissingEntitySubclassWarnings(): void {
  warned.clear();
}
