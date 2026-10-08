import { CONVERSATIONS_FORKING_SETTING_KEY, IsForkingSettingOn, UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Whether forking is on for the current person: their `mj.conversations.forking.v1` setting is not
 * `off`. Never throws; when the settings cannot be read, forking counts as on, its default.
 */
export function IsForkingOnForUser(): boolean {
    try {
        return IsForkingSettingOn(UserInfoEngine.Instance.GetSetting(CONVERSATIONS_FORKING_SETTING_KEY));
    } catch {
        return true;
    }
}

/** Saves the current person's forking setting as `on` or `off`. Resolves false when the save fails. */
export async function SaveForkingForUser(on: boolean): Promise<boolean> {
    return UserInfoEngine.Instance.SetSetting(CONVERSATIONS_FORKING_SETTING_KEY, on ? 'on' : 'off');
}
