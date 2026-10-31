import { describe, it, expect, vi } from 'vitest';
import type { MJProjectEntity } from '@memberjunction/core-entities';
import { ConfirmMoveIntoFolder } from '../lib/utils/folder-move';

/** The question every move path asks before a conversation lands in a folder that shares it. */
const engine = (tier: 'Private' | 'Shared' | 'Public') => ({
  GetProjectVisibilityTier: () => tier,
  Projects: [{ ID: 'p1', Name: 'Budget' } as unknown as MJProjectEntity],
});

describe('ConfirmMoveIntoFolder', () => {
  it('asks before a move into a Shared or Public folder, naming the folder', async () => {
    for (const tier of ['Shared', 'Public'] as const) {
      const confirm = vi.fn().mockResolvedValue(false);
      expect(await ConfirmMoveIntoFolder({ confirm }, engine(tier), 'p1', 2)).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(String(confirm.mock.calls[0][0].message)).toBe('People with access to "Budget" will see these 2 conversations.');
    }
  });

  it('moves into a Private folder, or out of all folders, without asking', async () => {
    const confirm = vi.fn();
    expect(await ConfirmMoveIntoFolder({ confirm }, engine('Private'), 'p1', 1)).toBe(true);
    expect(await ConfirmMoveIntoFolder({ confirm }, engine('Public'), null, 1)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
