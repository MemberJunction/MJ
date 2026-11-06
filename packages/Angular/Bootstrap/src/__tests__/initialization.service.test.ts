import { describe, it, expect, vi } from 'vitest';
import { MJInitializationService } from '../lib/services/initialization.service';

/**
 * IsNoUserRolesError decides whether a failed boot shows the no-roles screen. SetupGraphQLClient
 * rejects with the metadata download's failure appended to its own message (#4887), and the server
 * names the entity `MJ: User Roles` — both must still read as "no roles".
 */
describe('MJInitializationService.IsNoUserRolesError', () => {
    // The check reads only the error; none of the injected services are touched.
    const service = new MJInitializationService({} as never, {} as never, null);

    it('matches a failed boot caused by the MJ: User Roles permission', () => {
        const err = new Error(
            'SetupGraphQLClient: no entity metadata was loaded from http://localhost:4000/ — the metadata download failed or returned nothing: ' +
            'User a@b.com does not have read permissions on MJ: User Roles'
        );
        expect(service.IsNoUserRolesError(err)).toBe(true);
    });

    it('matches the unprefixed entity name from an older server', () => {
        expect(service.IsNoUserRolesError(new Error('User a@b.com does not have read permissions on User Roles'))).toBe(true);
    });

    it('matches a GraphQL-style error carrying the permission text', () => {
        const err = { response: { errors: [{ message: 'User a@b.com does not have read permissions on MJ: User Roles' }] } };
        expect(service.IsNoUserRolesError(err)).toBe(true);
    });

    it('does not match a permission error on another entity', () => {
        expect(service.IsNoUserRolesError(new Error('User a@b.com does not have read permissions on MJ: Roles'))).toBe(false);
    });

    it('does not match a boot failure with another cause', () => {
        const err = new Error('SetupGraphQLClient: no entity metadata was loaded from http://localhost:4000/ — the metadata download failed or returned nothing: network down');
        expect(service.IsNoUserRolesError(err)).toBe(false);
    });
});

/**
 * NavigateToInitialRoute runs once after a successful boot. A deep link is replayed through
 * the router; the bare root is left alone so the router's default route (the Home app) renders.
 * Nothing else may happen for '/': the Kendo drawer this once clicked no longer exists.
 */
describe('MJInitializationService.NavigateToInitialRoute', () => {
    function createService() {
        const router = { navigateByUrl: vi.fn() };
        const service = new MJInitializationService(router as never, {} as never, null);
        return { router, service };
    }

    it('replays a deep link through the router, replacing the auth redirect in history', () => {
        const { router, service } = createService();
        service.NavigateToInitialRoute('/app/ai/Overview', document);
        expect(router.navigateByUrl).toHaveBeenCalledWith('/app/ai/Overview', { replaceUrl: true });
    });

    it('leaves the root path to the default route and schedules nothing else', () => {
        vi.useFakeTimers();
        try {
            const { router, service } = createService();
            service.NavigateToInitialRoute('/', document);
            expect(vi.getTimerCount()).toBe(0);
            vi.runAllTimers();
            expect(router.navigateByUrl).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('clears the jwt retry marker on both paths', () => {
        localStorage.setItem('jwt-retry-ts', '123');
        createService().service.NavigateToInitialRoute('/', document);
        expect(localStorage.getItem('jwt-retry-ts')).toBeNull();
        localStorage.setItem('jwt-retry-ts', '456');
        createService().service.NavigateToInitialRoute('/app/x', document);
        expect(localStorage.getItem('jwt-retry-ts')).toBeNull();
    });
});
