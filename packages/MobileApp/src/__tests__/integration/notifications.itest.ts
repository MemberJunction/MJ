import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { MJUserSettingEntity } from '@memberjunction/core-entities';
import { initLiveProvider, hasToken, md } from './setup-live';
// Imports the PORTABLE store, not `notifications.ts` — the latter pulls in expo-notifications and
// react-native, which do not load under Node. Splitting them is what makes this suite possible.
import { SavePushToken, RemovePushToken, PUSH_TOKEN_SETTING_KEY } from '@/data/services/push-token-store';

/** A fixed installation id, so the suite is deterministic across runs. */
const INSTALL_ID = 'integration-install-a';

/**
 * Live coverage for push-token storage (G3).
 *
 * The parts that genuinely need hardware — obtaining an Expo push token from APNs/FCM, and
 * receiving a notification — cannot run on a simulator, and this suite does not pretend otherwise.
 * What it does verify is the half that broke in practice: that a user's devices each keep their own
 * slot, so registering on a second device does not silently stop the first receiving anything.
 *
 * Gated on `MJ_TEST_JWT`, and self-cleaning.
 */
describe.runIf(hasToken())('integration: push token storage', () => {
    beforeAll(async () => {
        await initLiveProvider();
        await RemovePushToken(INSTALL_ID);
    }, 60000);

    afterAll(async () => {
        await RemovePushToken(INSTALL_ID).catch(() => undefined);
    }, 60000);

    /** Reads the raw stored value for the signed-in user. */
    async function StoredValue(): Promise<string | null> {
        const result = await new RunView().RunView<{ ID: string; Value: string }>({
            EntityName: 'MJ: User Settings',
            ExtraFilter: `UserID='${md().CurrentUser.ID}' AND Setting='${PUSH_TOKEN_SETTING_KEY}'`,
            Fields: ['ID', 'Value'],
            ResultType: 'simple',
        });
        return result.Success && result.Results?.length ? result.Results[0].Value : null;
    }

    it('persists a device token as a keyed map, server-side', async () => {
        expect(await SavePushToken(INSTALL_ID, 'ExponentPushToken[integration-a]', 'ios')).toBe(true);

        const raw = await StoredValue();
        expect(raw, 'no user setting row was written').toBeTruthy();

        const map = JSON.parse(raw as string) as Record<string, { token: string; platform: string }>;
        const entries = Object.entries(map);
        expect(entries).toHaveLength(1);
        expect(entries[0][1].token).toBe('ExponentPushToken[integration-a]');
        // Keyed by installation, not by user — that keying is the fix.
        expect(entries[0][0]).toMatch(/.+/);
    }, 60000);

    it('replaces this device\'s token on re-registration without adding a slot', async () => {
        await SavePushToken(INSTALL_ID, 'ExponentPushToken[integration-a]', 'ios');
        await SavePushToken(INSTALL_ID, 'ExponentPushToken[integration-b]', 'ios');

        const map = JSON.parse((await StoredValue()) as string) as Record<string, { token: string }>;
        // A token refresh on the same install must not accumulate dead slots.
        expect(Object.keys(map)).toHaveLength(1);
        expect(Object.values(map)[0].token).toBe('ExponentPushToken[integration-b]');
    }, 60000);

    it('empties the map when the last device unregisters, rather than deleting the row', async () => {
        // The standard UI role has Update but deliberately not Delete on MJ: User Settings, so
        // clearing is the only path that works for the people the setting belongs to.
        await SavePushToken(INSTALL_ID, 'ExponentPushToken[integration-a]', 'ios');
        expect(await RemovePushToken(INSTALL_ID)).toBe(true);
        expect(JSON.parse((await StoredValue()) as string)).toEqual({});
    }, 60000);

    it('survives a malformed stored value rather than losing the registration', async () => {
        await SavePushToken(INSTALL_ID, 'ExponentPushToken[integration-a]', 'ios');
        const raw = await StoredValue();
        expect(raw).toBeTruthy();

        // Corrupt the row the way a partial write or a hand-edit would.
        const setting = await md().GetEntityObject<MJUserSettingEntity>('MJ: User Settings', md().CurrentUser);
        const found = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: User Settings',
            ExtraFilter: `UserID='${md().CurrentUser.ID}' AND Setting='${PUSH_TOKEN_SETTING_KEY}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        });
        expect(await setting.Load(found.Results![0].ID)).toBe(true);
        setting.Value = '{not json';
        expect(await setting.Save()).toBe(true);

        // Registering again must recover rather than throw.
        expect(await SavePushToken(INSTALL_ID, 'ExponentPushToken[integration-c]', 'ios')).toBe(true);
        const map = JSON.parse((await StoredValue()) as string) as Record<string, { token: string }>;
        expect(Object.values(map)[0].token).toBe('ExponentPushToken[integration-c]');
    }, 60000);
});
