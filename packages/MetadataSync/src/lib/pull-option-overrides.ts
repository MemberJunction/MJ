/**
 * @fileoverview Applies one pull run's CLI overrides to an entity folder's config.
 * @module pull-option-overrides
 */

import type { EntityConfig } from '../config';

/** Pull settings that CLI flags can set for one run. */
export interface PullFieldOverrides {
  /** Replaces the folder's pull.mergeStrategy. */
  MergeStrategy?: 'overwrite' | 'merge' | 'skip';
  /** Added to the folder's pull.preserveFields. */
  PreserveFields?: string[];
  /** Added to the folder's pull.excludeFields. */
  ExcludeFields?: string[];
  /** Replaces the folder's pull.updateExistingRecords when given. */
  UpdateExistingRecords?: boolean;
  /** Replaces the folder's pull.createNewFileIfNotFound when given. */
  CreateNewFileIfNotFound?: boolean;
}

/**
 * Returns a copy of the config with the overrides applied. Returns the same config
 * object when there is nothing to apply.
 */
export function ApplyPullOverrides(config: EntityConfig, overrides: PullFieldOverrides): EntityConfig {
  const hasOverride =
    !!overrides.MergeStrategy ||
    !!overrides.PreserveFields?.length ||
    !!overrides.ExcludeFields?.length ||
    overrides.UpdateExistingRecords !== undefined ||
    overrides.CreateNewFileIfNotFound !== undefined;
  if (!hasOverride) {
    return config;
  }
  const pull = { ...config.pull };
  if (overrides.MergeStrategy) {
    pull.mergeStrategy = overrides.MergeStrategy;
  }
  if (overrides.PreserveFields?.length) {
    pull.preserveFields = unique([...(pull.preserveFields ?? []), ...overrides.PreserveFields]);
  }
  if (overrides.ExcludeFields?.length) {
    pull.excludeFields = unique([...(pull.excludeFields ?? []), ...overrides.ExcludeFields]);
  }
  if (overrides.UpdateExistingRecords !== undefined) {
    pull.updateExistingRecords = overrides.UpdateExistingRecords;
  }
  if (overrides.CreateNewFileIfNotFound !== undefined) {
    pull.createNewFileIfNotFound = overrides.CreateNewFileIfNotFound;
  }
  return { ...config, pull };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
