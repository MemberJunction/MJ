/**
 * Integration: the application-host layer against the live backend.
 *
 * `LoadUserApplications` reads nothing over the wire — it composes `Metadata.Applications` (which
 * rides in the metadata payload) with `UserInfoEngine`'s cached `MJ: User Applications` rows. That
 * is exactly why it needs a live test: a unit test with both mocked proves the composition, and
 * proves nothing about whether either source is actually populated on a real client. If the
 * metadata payload ever stopped carrying applications, every mocked test here would stay green
 * while the launcher rendered empty on a device.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { initLiveProvider, hasToken } from './setup-live';
import { LoadUserApplications, ParseNavItems, DefaultNavItem } from '@/host/applications';

describe.skipIf(!hasToken())('integration: application host', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('the metadata payload actually carries applications', () => {
        // The load-bearing assumption. Everything below is composition on top of it.
        expect(new Metadata().Applications.length).toBeGreaterThan(0);
    });

    it('loads the signed-in user’s applications', async () => {
        const apps = await LoadUserApplications();
        expect(apps.length).toBeGreaterThan(0);
        for (const a of apps) {
            expect(a.ID).toBeTruthy();
            expect(a.Name).toBeTruthy();
        }
    });

    it('never returns an application an administrator retired', async () => {
        // A stock deployment ships `Admin (Deprecated)`, so this has something real to exclude.
        const md = new Metadata();
        const retired = new Set(
            md.Applications.filter((a) => a.Status !== 'Active').map((a) => a.ID.toLowerCase()),
        );
        expect(retired.size).toBeGreaterThan(0);

        const apps = await LoadUserApplications();
        expect(apps.filter((a) => retired.has(a.ID.toLowerCase()))).toEqual([]);
    });

    it('parses real nav metadata into items the shell can resolve', async () => {
        const apps = await LoadUserApplications();
        const withNav = apps.filter((a) => a.NavItems.length > 0);
        expect(withNav.length).toBeGreaterThan(0);

        for (const a of withNav) {
            expect(DefaultNavItem(a)).not.toBeNull();
            for (const item of a.NavItems) {
                expect(item.Label).toBeTruthy();
                // Every nav item MJ ships is a Custom driver; a generic one would carry a RecordID.
                if (item.ResourceType === 'Custom') {
                    expect(item.DriverClass).toBeTruthy();
                }
            }
        }
    });

    it('parses the raw column the same way for every application in the deployment', () => {
        // Guards the tolerant parser against real authored metadata rather than fixtures.
        for (const a of new Metadata().Applications) {
            expect(() => ParseNavItems(a.DefaultNavItems)).not.toThrow();
        }
    });
});
