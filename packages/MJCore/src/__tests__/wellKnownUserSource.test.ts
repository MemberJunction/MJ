import { describe, it, expect } from 'vitest';
import { MJGlobal, RegisterClassEx } from '@memberjunction/global';
import { WellKnownUserSource } from '../generic/wellKnownUserSource';
import { IMetadataProvider } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';

/**
 * The plug-in contract for WellKnownUserSource: the base answers null so a process with no
 * server-side implementation loaded (a browser, most obviously) degrades correctly, and the
 * ClassFactory resolves a registered subclass when one exists.
 */

/**
 * The system-user GUID. Declared locally because the canonical constant now lives in
 * `@memberjunction/generic-database-provider` (a server-side package MJCore must not depend
 * on) — shared code asks `WellKnownUserSource.Instance.IsSystemUser()` instead of importing it.
 */
const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';

const SYSTEM_USER = { ID: SYSTEM_USER_ID, Name: 'System' } as unknown as UserInfo;
const FAKE_PROVIDER = {} as unknown as IMetadataProvider;

/** Stands in for a server-side implementation. */
@RegisterClassEx(WellKnownUserSource, { priority: 1, skipNullKeyWarning: true })
class TestWellKnownUserSource extends WellKnownUserSource {
    public override async GetSystemUser(_provider: IMetadataProvider): Promise<UserInfo | null> {
        return SYSTEM_USER;
    }
}

/** Higher priority than the one above — proves priority ordering picks the most specific. */
@RegisterClassEx(WellKnownUserSource, { priority: 5, skipNullKeyWarning: true })
class HigherPriorityWellKnownUserSource extends WellKnownUserSource {
    public override async GetSystemUser(_provider: IMetadataProvider): Promise<UserInfo | null> {
        return { ...SYSTEM_USER, Name: 'HigherPriority' } as unknown as UserInfo;
    }
}

/** A base with no registrations, to verify the unregistered fallback path. */
class UnregisteredSourceBase {
    public async GetSystemUser(_provider: IMetadataProvider): Promise<UserInfo | null> {
        return null;
    }
}

describe('WellKnownUserSource', () => {
    it('answers null by default, so a process without a server implementation degrades', async () => {
        const base = new WellKnownUserSource();
        await expect(base.GetSystemUser(FAKE_PROVIDER)).resolves.toBeNull();
    });

    it('is concrete, so ClassFactory can instantiate it as the no-registration fallback', () => {
        // This is why the base must not be abstract and must not be marked @RequiresSubclass():
        // CreateInstance falls back to the base when nothing is registered, and that fallback
        // IS the correct client-side behavior.
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<UnregisteredSourceBase>(UnregisteredSourceBase);
        expect(instance).toBeInstanceOf(UnregisteredSourceBase);
    });

    it('resolves a registered subclass through the class factory', async () => {
        const source = MJGlobal.Instance.ClassFactory.CreateInstance<WellKnownUserSource>(WellKnownUserSource);
        expect(source).toBeDefined();
        const user = await source!.GetSystemUser(FAKE_PROVIDER);
        expect(user?.ID).toBe(SYSTEM_USER_ID);
    });

    it('honors registration priority, so a downstream repo can override', async () => {
        const source = MJGlobal.Instance.ClassFactory.CreateInstance<WellKnownUserSource>(WellKnownUserSource);
        expect(source).toBeInstanceOf(HigherPriorityWellKnownUserSource);
        const user = await source!.GetSystemUser(FAKE_PROVIDER);
        expect(user?.Name).toBe('HigherPriority');
    });

    it('keeps TestWellKnownUserSource registered too (priority selects, it does not replace)', () => {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(WellKnownUserSource);
        const names = registrations.map((r) => (r.SubClass as { name: string }).name);
        expect(names).toContain('TestWellKnownUserSource');
        expect(names).toContain('HigherPriorityWellKnownUserSource');
    });
});
