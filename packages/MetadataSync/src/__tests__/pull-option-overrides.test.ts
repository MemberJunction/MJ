import { describe, it, expect } from 'vitest';
import type { EntityConfig } from '../config';
import { ApplyPullOverrides } from '../lib/pull-option-overrides';

const base: EntityConfig = {
  entity: 'MJ: Tags',
  pull: { mergeStrategy: 'merge', preserveFields: ['Notes'], excludeFields: ['Secret'] },
};

describe('ApplyPullOverrides', () => {
  it('returns the same config when there are no overrides', () => {
    expect(ApplyPullOverrides(base, {})).toBe(base);
  });

  it('replaces the merge strategy', () => {
    expect(ApplyPullOverrides(base, { MergeStrategy: 'skip' }).pull?.mergeStrategy).toBe('skip');
  });

  it('adds preserve and exclude fields to the config lists, without duplicates', () => {
    const result = ApplyPullOverrides(base, { PreserveFields: ['Notes', 'Description'], ExcludeFields: ['Token'] });

    expect(result.pull?.preserveFields).toEqual(['Notes', 'Description']);
    expect(result.pull?.excludeFields).toEqual(['Secret', 'Token']);
  });

  it('works when the config has no pull section', () => {
    expect(ApplyPullOverrides({ entity: 'MJ: Tags' }, { ExcludeFields: ['Token'] }).pull).toEqual({ excludeFields: ['Token'] });
  });

  it('does not change the input config', () => {
    ApplyPullOverrides(base, { MergeStrategy: 'overwrite', PreserveFields: ['X'] });

    expect(base.pull).toEqual({ mergeStrategy: 'merge', preserveFields: ['Notes'], excludeFields: ['Secret'] });
  });

  it('writes update-existing and create-new when given, false included', () => {
    const result = ApplyPullOverrides(base, { UpdateExistingRecords: false, CreateNewFileIfNotFound: false });

    expect(result.pull?.updateExistingRecords).toBe(false);
    expect(result.pull?.createNewFileIfNotFound).toBe(false);
    expect(result.pull?.mergeStrategy).toBe('merge');
  });

  it('writes true over a folder value of false', () => {
    const folder: EntityConfig = { entity: 'MJ: Tags', pull: { updateExistingRecords: false, createNewFileIfNotFound: false } };

    const result = ApplyPullOverrides(folder, { UpdateExistingRecords: true, CreateNewFileIfNotFound: true });

    expect(result.pull).toEqual({ updateExistingRecords: true, createNewFileIfNotFound: true });
  });

  it('keeps the folder values when the two overrides are not given', () => {
    const folder: EntityConfig = { entity: 'MJ: Tags', pull: { updateExistingRecords: false } };

    expect(ApplyPullOverrides(folder, {})).toBe(folder);
  });
});
