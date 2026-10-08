import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { IsForkingOnForUser, SaveForkingForUser } from './forking-setting';

describe('the personal forking setting', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is on with no setting or "on", off with "off"', () => {
        const get = vi.spyOn(UserInfoEngine.Instance, 'GetSetting');
        get.mockReturnValue(undefined);
        expect(IsForkingOnForUser()).toBe(true);
        get.mockReturnValue('on');
        expect(IsForkingOnForUser()).toBe(true);
        get.mockReturnValue('off');
        expect(IsForkingOnForUser()).toBe(false);
        expect(get).toHaveBeenCalledWith('mj.conversations.forking.v1');
    });

    it('counts as on when the settings cannot be read', () => {
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation(() => { throw new Error('not loaded'); });
        expect(IsForkingOnForUser()).toBe(true);
    });

    it('saves "on" or "off" under the forking key and returns whether it saved', async () => {
        const set = vi.spyOn(UserInfoEngine.Instance, 'SetSetting').mockResolvedValue(true);
        expect(await SaveForkingForUser(false)).toBe(true);
        expect(set).toHaveBeenCalledWith('mj.conversations.forking.v1', 'off');
        set.mockResolvedValue(false);
        expect(await SaveForkingForUser(true)).toBe(false);
        expect(set).toHaveBeenLastCalledWith('mj.conversations.forking.v1', 'on');
    });
});
