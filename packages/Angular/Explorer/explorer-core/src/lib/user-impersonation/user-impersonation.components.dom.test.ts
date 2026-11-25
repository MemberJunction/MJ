import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BaseUserMenu, isUserMenuDivider, type UserMenuContext, type UserMenuItem } from '../user-menu';
import {
    MJ_USER_IMPERSONATION_TRANSPORT,
    MJUserImpersonationService,
    UserImpersonationBannerComponent,
    UserImpersonationDialogComponent,
    type MJImpersonationProviderLike,
    type MJImpersonationTransportAdapter,
} from './index';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_A_ID = '22222222-2222-4222-8222-222222222222';
const USER_B_ID = '33333333-3333-4333-8333-333333333333';
const KEY_A_ID = 'aaaa1111-1111-4111-8111-111111111111';

function setupImpersonationTestingModule() {
    const actorProvider: MJImpersonationProviderLike = {
        CurrentUser: {
            ID: ACTOR_USER_ID,
            Name: 'Alice Admin',
            Email: 'alice@example.com',
        } as MJImpersonationProviderLike['CurrentUser'],
        ExecuteGQL: vi.fn().mockImplementation(async (query: string) => {
            if (query.includes('MJCanImpersonateUsers')) {
                return { MJCanImpersonateUsers: { CanImpersonate: true, ResultCode: 'OK' } };
            }
            if (query.includes('MJListImpersonatableUsers')) {
                return {
                    MJListImpersonatableUsers: {
                        Authorized: true,
                        ResultCode: 'OK',
                        TotalCount: 2,
                        Users: [
                            {
                                UserID: USER_A_ID,
                                Name: 'Bob Analyst',
                                Email: 'bob@example.com',
                                Title: 'Revenue Analyst',
                                RoleNames: ['Analyst'],
                            },
                            {
                                UserID: USER_B_ID,
                                Name: 'Cara Executive',
                                Email: 'cara@example.com',
                                Title: 'VP Finance',
                                RoleNames: ['Executive'],
                            },
                        ],
                    },
                };
            }
            if (query.includes('MJStartUserImpersonation')) {
                return {
                    MJStartUserImpersonation: {
                        Success: true,
                        ResultCode: 'IMPERSONATION_STARTED',
                        RawApiKey: 'mj_sk_test',
                        APIKeyID: KEY_A_ID,
                        TargetUser: {
                            UserID: USER_A_ID,
                            Name: 'Bob Analyst',
                            Email: 'bob@example.com',
                            RoleNames: ['Analyst'],
                        },
                    },
                };
            }
            if (query.includes('MJEndUserImpersonation')) {
                return { MJEndUserImpersonation: { Success: true, ResultCode: 'IMPERSONATION_ENDED', APIKeyID: KEY_A_ID } };
            }
            return {};
        }),
    };

    const transport: MJImpersonationTransportAdapter = {
        getActiveProvider: () => actorProvider,
        installProvider: vi.fn(),
        createImpersonatedProvider: vi.fn().mockResolvedValue(actorProvider),
        syncProviderReferences: vi.fn().mockResolvedValue(undefined),
        resetWorkspaceAfterSwitch: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        imports: [UserImpersonationDialogComponent, UserImpersonationBannerComponent],
        providers: [
            MJUserImpersonationService,
            { provide: MJ_USER_IMPERSONATION_TRANSPORT, useValue: transport },
        ],
    });

    const service = TestBed.inject(MJUserImpersonationService);
    return { service };
}

describe('UserImpersonationDialogComponent & UserImpersonationBannerComponent (DOM)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders searchable users, adapter quick presets, and category filters inside the dialog', async () => {
        const { service } = setupImpersonationTestingModule();
        service.RegisterAppAdapter({
            id: 'test-adapter',
            title: 'Custom Switcher Title',
            categories: [
                { key: 'analysts', label: 'Analysts' },
                { key: 'execs', label: 'Executives' },
            ],
            quickPresets: [
                {
                    key: 'analyst-preset',
                    label: 'Quick Analyst',
                    description: 'Jump to Bob',
                    resolveCandidate: (users) => users.find((u) => u.userId === USER_A_ID),
                },
            ],
            enrichCandidates: (users) =>
                users.map((u) => ({
                    ...u,
                    categoryKey: u.userId === USER_A_ID ? 'analysts' : 'execs',
                    organization: 'Contoso',
                })),
        });

        await service.CheckCanImpersonate();
        const fixture = TestBed.createComponent(UserImpersonationDialogComponent);
        fixture.detectChanges();

        // Hidden until opened
        expect(fixture.nativeElement.querySelector('.impersonation-dialog')).toBeNull();

        service.OpenDialog();
        await service.LoadUsers('', true);
        fixture.detectChanges();

        const dialogEl = fixture.nativeElement.querySelector('.impersonation-dialog') as HTMLElement | null;
        expect(dialogEl).not.toBeNull();
        expect(dialogEl?.textContent).toContain('Custom Switcher Title');
        expect(dialogEl?.textContent).toContain('Quick Analyst');
        expect(dialogEl?.querySelectorAll('.impersonation-user-row')).toHaveLength(2);

        // Filter by category pill
        fixture.componentInstance.SelectCategory('execs');
        fixture.detectChanges();
        expect(dialogEl?.querySelectorAll('.impersonation-user-row')).toHaveLength(1);
        expect(dialogEl?.textContent).toContain('Cara Executive');

        // Clear category and filter by search term
        fixture.componentInstance.SelectCategory(null);
        fixture.componentInstance.OnSearchChanged('revenue');
        fixture.detectChanges();
        expect(dialogEl?.querySelectorAll('.impersonation-user-row')).toHaveLength(1);
        expect(dialogEl?.textContent).toContain('Bob Analyst');

        // Escape closes dialog
        fixture.componentInstance.OnEscapeKey();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.impersonation-dialog')).toBeNull();
    });

    it('shows the active impersonation banner while impersonating and hides it after exit', async () => {
        const { service } = setupImpersonationTestingModule();
        await service.CheckCanImpersonate();

        const fixture = TestBed.createComponent(UserImpersonationBannerComponent);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.impersonation-banner')).toBeNull();

        await service.StartImpersonation(USER_A_ID);
        fixture.detectChanges();

        const bannerEl = fixture.nativeElement.querySelector('.impersonation-banner') as HTMLElement | null;
        expect(bannerEl).not.toBeNull();
        expect(bannerEl?.textContent).toContain('Bob Analyst');
        expect(bannerEl?.textContent).toContain('bob@example.com');

        await fixture.componentInstance.OnExit();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.impersonation-banner')).toBeNull();
    });
});

describe('BaseUserMenu — View As User / Exit Impersonation items', () => {
    it('hides impersonation items by default when canImpersonate is false or omitted', async () => {
        const menu = new BaseUserMenu();
        await menu.Initialize({
            showAdminMenuItems: true,
            isDeveloper: true,
            developerModeEnabled: true,
        } as UserMenuContext);

        const ids = menu
            .GetMenuElements()
            .filter((el): el is UserMenuItem => !isUserMenuDivider(el))
            .map((i) => i.id);
        expect(ids).not.toContain('view-as-user');
        expect(ids).not.toContain('exit-impersonation');
    });

    it('shows View As User when canImpersonate is true, and Switch + Exit while impersonating (even if showAdminMenuItems is false)', async () => {
        const menu = new BaseUserMenu();
        await menu.Initialize({
            showAdminMenuItems: false,
            canImpersonate: true,
            isImpersonating: false,
        } as UserMenuContext);

        let items = menu
            .GetMenuElements()
            .filter((el): el is UserMenuItem => !isUserMenuDivider(el));
        expect(items.find((i) => i.id === 'view-as-user')?.label).toBe('View As User...');
        expect(items.find((i) => i.id === 'exit-impersonation')).toBeUndefined();

        const clickRes = await menu.HandleItemClick('view-as-user');
        expect(clickRes).toEqual({ success: true, closeMenu: true, message: 'view-as-user' });

        menu.UpdateContext({ isImpersonating: true });
        items = menu
            .GetMenuElements()
            .filter((el): el is UserMenuItem => !isUserMenuDivider(el));
        expect(items.find((i) => i.id === 'view-as-user')?.label).toBe('Switch Impersonated User...');
        expect(items.find((i) => i.id === 'exit-impersonation')?.label).toBe('Exit Impersonation');

        const exitRes = await menu.HandleItemClick('exit-impersonation');
        expect(exitRes).toEqual({ success: true, closeMenu: true, message: 'exit-impersonation' });
    });
});
