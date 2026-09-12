import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamsMeetingsExtension } from '../server-extensions/TeamsMeetingsExtension.js';
import type { ServerExtensionInitContext } from '@memberjunction/server-extensions-core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Metadata } from '@memberjunction/core';
import * as calendarSchedulerModule from '../telephony/calendar-scheduler.js';

describe('TeamsMeetingsExtension — Calendar Scheduler wiring', () => {
    let extension: TeamsMeetingsExtension;
    let mockStop: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        extension = new TeamsMeetingsExtension();
        mockStop = vi.fn();
        vi.spyOn(calendarSchedulerModule, 'StartCalendarScheduler').mockReturnValue({
            Stop: mockStop,
        });
    });

    it('starts calendar scheduler on OnAllExtensionsMounted when initialized with config and system user exists', async () => {
        const fakeApp = { use: vi.fn() } as unknown as Parameters<typeof extension.Initialize>[0]['app'];
        const fakeServices = { RegisterService: vi.fn(), GetService: vi.fn(), HasService: vi.fn() };
        const initContext: ServerExtensionInitContext = {
            app: fakeApp,
            config: {
                Enabled: true,
                DriverClass: 'TeamsMeetingsExtension',
                RootPath: '/meetings/teams',
                Settings: {
                    enabled: true,
                    appId: 'test-app-id',
                    tenantId: 'test-tenant-id',
                    botAccessToken: 'secret-token',
                },
            },
            services: fakeServices,
            phase: 'pre-auth',
        };

        const fakeUser = { ID: 'system-user', Email: 'system@mj.com' };
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(fakeUser as never);
        const fakeProvider = {} as never;
        Metadata.Provider = fakeProvider;

        const initResult = await extension.Initialize(initContext);
        expect(initResult.Success).toBe(true);

        await extension.OnAllExtensionsMounted(initContext);
        expect(calendarSchedulerModule.StartCalendarScheduler).toHaveBeenCalledWith(
            expect.objectContaining({
                Provider: fakeProvider,
                ContextUser: fakeUser,
            })
        );

        // Verify Shutdown cleans up the running scheduler
        await extension.Shutdown();
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('skips starting scheduler if not configured/skipped', async () => {
        const fakeApp = { use: vi.fn() } as unknown as Parameters<typeof extension.Initialize>[0]['app'];
        const fakeServices = { RegisterService: vi.fn(), GetService: vi.fn(), HasService: vi.fn() };
        const initContext: ServerExtensionInitContext = {
            app: fakeApp,
            config: {
                Enabled: true,
                DriverClass: 'TeamsMeetingsExtension',
                RootPath: '/meetings/teams',
                Settings: {
                    enabled: false,
                },
            },
            services: fakeServices,
            phase: 'pre-auth',
        };

        const initResult = await extension.Initialize(initContext);
        expect(initResult.Success).toBe(false);

        await extension.OnAllExtensionsMounted(initContext);
        expect(calendarSchedulerModule.StartCalendarScheduler).not.toHaveBeenCalled();
    });
});
