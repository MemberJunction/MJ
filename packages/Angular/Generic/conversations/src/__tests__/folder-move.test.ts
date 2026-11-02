import { describe, it, expect, vi } from 'vitest';
import type { MJProjectEntity } from '@memberjunction/core-entities';
import { ConfirmInheritFolderAccess, ConfirmMoveIntoFolder } from '../lib/utils/folder-move';

/** The question every move path asks before a conversation lands in a folder that shares it. */
const engine = (tier: 'Private' | 'Shared' | 'Public') => ({
  GetProjectVisibilityTier: () => tier,
  Projects: [{ ID: 'p1', Name: 'Budget' } as unknown as MJProjectEntity],
});
/** A conversation whose owner turned on folder inheritance, and one left at the default (off). */
const inheriting = { AdditionalData: '{"inheritFolderAccess":true}' };
const notInheriting = { AdditionalData: null };

describe('ConfirmMoveIntoFolder', () => {
  it('asks before a move of inheriting conversations into a Shared or Public folder, naming the folder and counting only those', async () => {
    for (const tier of ['Shared', 'Public'] as const) {
      const confirm = vi.fn().mockResolvedValue(false);
      expect(await ConfirmMoveIntoFolder({ confirm }, engine(tier), 'p1', [inheriting, inheriting, notInheriting])).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(String(confirm.mock.calls[0][0].message)).toBe('People with access to "Budget" will see these 2 conversations.');
    }
  });

  it('moves without asking when no moved conversation inherits, since the folder then shows it to no one', async () => {
    const confirm = vi.fn();
    expect(await ConfirmMoveIntoFolder({ confirm }, engine('Public'), 'p1', [notInheriting, undefined])).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('moves into a Private folder, or out of all folders, without asking', async () => {
    const confirm = vi.fn();
    expect(await ConfirmMoveIntoFolder({ confirm }, engine('Private'), 'p1', [inheriting])).toBe(true);
    expect(await ConfirmMoveIntoFolder({ confirm }, engine('Public'), null, [inheriting])).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('ConfirmInheritFolderAccess', () => {
  it('asks before turning on inheritance in a Shared or Public folder, naming the folder', async () => {
    for (const tier of ['Shared', 'Public'] as const) {
      const confirm = vi.fn().mockResolvedValue(false);
      expect(await ConfirmInheritFolderAccess({ confirm }, engine(tier), 'p1')).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0][0]).toEqual({
        title: 'Inherit folder access?',
        message: 'People with access to "Budget" will see this conversation.',
        okText: 'Inherit',
      });
    }
  });

  it('turns on inheritance in a Private folder, or with no folder, without asking', async () => {
    const confirm = vi.fn();
    expect(await ConfirmInheritFolderAccess({ confirm }, engine('Private'), 'p1')).toBe(true);
    expect(await ConfirmInheritFolderAccess({ confirm }, engine('Public'), null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

