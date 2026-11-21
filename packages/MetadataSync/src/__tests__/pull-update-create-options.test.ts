/** PullService maps updateExistingRecords / createNewFileIfNotFound into the folder's pull config. */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { EntityConfig } from '../config';
import { ApplyPullOverrides } from '../lib/pull-option-overrides';
import { PullService } from '../services/PullService';
import { SyncEngine } from '../lib/sync-engine';

describe('PullService option mapping', () => {
  it('maps the two options to their override names, and the overrides apply to the pull config', () => {
    const service = new PullService(new SyncEngine({} as UserInfo), {} as UserInfo);
    const config: EntityConfig = { entity: 'MJ: Tags' };

    const result = service['pullOverridesFor']({ entity: 'MJ: Tags', updateExistingRecords: false, createNewFileIfNotFound: true, MergeStrategy: 'skip' });
    const applied = ApplyPullOverrides(config, result);

    expect(result).toMatchObject({ UpdateExistingRecords: false, CreateNewFileIfNotFound: true, MergeStrategy: 'skip' });
    expect(applied.pull).toEqual({ updateExistingRecords: false, createNewFileIfNotFound: true, mergeStrategy: 'skip' });
  });

  it('maps no update or create override when the options are not given', () => {
    const service = new PullService(new SyncEngine({} as UserInfo), {} as UserInfo);

    const result = service['pullOverridesFor']({ entity: 'MJ: Tags' });

    expect(result.UpdateExistingRecords).toBeUndefined();
    expect(result.CreateNewFileIfNotFound).toBeUndefined();
  });
});
