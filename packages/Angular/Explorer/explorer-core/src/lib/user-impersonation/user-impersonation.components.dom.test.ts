import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BaseUserMenu, isUserMenuDivider, type UserMenuContext, type UserMenuItem } from '../user-menu';
import {
    MJ_USER_IMPERSONATION_TRANSPORT,
    MJUserImpersonationService,
    UserImpersonationBannerComponent,
    UserImpersonationDialogComponent,
    type MJImpersonationMode,
    type MJImpersonationProviderLike,
    type MJImpersonationTransportAdapter,
} from './index';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_A_ID = '22222222-2222-4222-8222-222222222222';
const USER_B_ID = '33333333-3333-4333-8333-333333333333';
const KEY_A_ID = 'aaaa1111-1111-4111-8111-111111111111';

function setupImpersonationTestingModule(opts?: { canImpersonateWithWrites?: boolean }) {
    const canImpersonateWithWrites = opts?.canImpersonateWithWrites ?? false;
    const actorProvider: MJImpersonationProviderLike = {
        CurrentUser: {
            ID: ACTOR_USER_ID,
            Name: 'Alice Admin',
            Email: 'alice@example.com',
        } as MJImpersonationProviderLike['CurrentUser'],
        ExecuteGQL: vi.fn().mockImplementation(async (query: string, variables?: Record<string, unknown>) => {
            if (query.includes('MJCanImpersonateUsers')) {
                return {
                    MJCanImpersonateUsers: {
                        CanImpersonate: true,
                        CanImpersonateWithWrites: canImpersonateWithWrites,
                        DefaultTTLMinutes: 15,
                        MaxTTLMinutes: 60,
                        ResultCode: 'OK',
                    },
                };
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
                const input = (variables?.['input'] ?? {}) as { Mode?: MJImpersonationMode };
                const mode: MJImpersonationMode = input.Mode === 'ActAs' ? 'ActAs' : 'ViewAs';
                return {
                    MJStartUserImpersonation: {
                        Success: true,
                        ResultCode: 'IMPERSONATION_STARTED',
                        RawApiKey: 'mj_sk_test',
                        APIKeyID: KEY_A_ID,
                        Mode: mode,
                        ReadOnly: mode !== 'ActAs',
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
                return {
                    MJEndUserImpersonation: {
                        Success: true,
                        ResultCode: 'IMPERSONATION_ENDED',
                        APIKeyID: KEY_A_ID,
                    },
                };
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

    it('renders Read-Only mode chip by default, sanitizes unsafe icon classes, and filters by category/search', async () => {
        const { service } = setupImpersonationTestingModule({ canImpersonateWithWrites: false });
        service.RegisterAppAdapter({
            id: 'test-adapter',
            title: 'Custom Switcher Title',
            categories: [
                { key: 'analysts', label: 'Analysts', icon: 'fa-solid fa-chart-line' },
                { key: 'execs', label: 'Executives', icon: '"><img src=x onerror=alert(1)>' },
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

        expect(fixture.nativeElement.querySelector('.impersonation-dialog')).toBeNull();

        service.OpenDialog();
        await service.LoadUsers('', true);
        fixture.detectChanges();

        const dialogEl = fixture.nativeElement.querySelector('.impersonation-dialog') as HTMLElement | null;
        expect(dialogEl).not.toBeNull();
        expect(dialogEl?.textContent).toContain('Custom Switcher Title');
        expect(dialogEl?.textContent).toContain('Read-Only');
        expect(dialogEl?.textContent).toContain('15m session TTL');
        // Write mode bar is hidden when canImpersonateWithWrites is false
        expect(dialogEl?.querySelector('.impersonation-mode-bar')).toBeNull();
        // Unsafe icon payload rejected cleanly
        expect(fixture.componentInstance.SanitizeIconClass('"><img src=x>')).toBe('');
        expect(fixture.componentInstance.SanitizeIconClass('fa-solid fa-eye')).toBe('fa-solid fa-eye');

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

        fixture.componentInstance.OnEscapeKey();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.impersonation-dialog')).toBeNull();
    });

    it('surfaces [Read-Only] vs high-visibility [Write Mode Enabled] in dialog and banner when write mode is permitted', async () => {
        const { service } = setupImpersonationTestingModule({ canImpersonateWithWrites: true });
        await service.CheckCanImpersonate();

        const dialogFixture = TestBed.createComponent(UserImpersonationDialogComponent);
        const bannerFixture = TestBed.createComponent(UserImpersonationBannerComponent);
        dialogFixture.detectChanges();
        bannerFixture.detectChanges();

        // Start in default Read-Only mode -> Banner shows Viewing as ... [Read-Only]
        await service.StartImpersonation(USER_A_ID);
        bannerFixture.detectChanges();
        let bannerEl = bannerFixture.nativeElement.querySelector('.impersonation-banner') as HTMLElement | null;
        expect(bannerEl?.textContent).toContain('Viewing as');
        expect(bannerEl?.textContent).toContain('[Read-Only]');
        expect(bannerEl?.classList.contains('is-write-mode')).toBe(false);

        // Open dialog -> mode bar is rendered, defaults to ViewAs, switch to ActAs shows warning alert
        service.OpenDialog();
        await service.LoadUsers('', true);
        dialogFixture.detectChanges();
        expect(dialogFixture.componentInstance.SelectedMode).toBe('ViewAs');
        expect(dialogFixture.nativeElement.querySelector('.impersonation-mode-bar')).not.toBeNull();

        dialogFixture.componentInstance.SelectMode('ActAs');
        dialogFixture.detectChanges();
        expect(dialogFixture.nativeElement.querySelector('.impersonation-write-warning')).not.toBeNull();

        // Start in ActAs mode -> Banner switches to high-visibility Acting as ... [Write Mode Enabled]
        await service.StartImpersonation(USER_A_ID, undefined, 'ActAs');
        bannerFixture.detectChanges();
        bannerEl = bannerFixture.nativeElement.querySelector('.impersonation-banner') as HTMLElement | null;
        expect(bannerEl?.textContent).toContain('Acting as');
        expect(bannerEl?.textContent).toContain('[Write Mode Enabled]');
        expect(bannerEl?.classList.contains('is-write-mode')).toBe(true);

        // Re-opening dialog ALWAYS resets SelectedMode back to safe ViewAs default
        service.OpenDialog();
        dialogFixture.detectChanges();
        expect(dialogFixture.componentInstance.SelectedMode).toBe('ViewAs');

        await bannerFixture.componentInstance.OnExit();
        bannerFixture.detectChanges();
        expect(bannerFixture.nativeElement.querySelector('.impersonation-banner')).toBeNull();
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
