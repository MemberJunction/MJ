/**
 * BaseAdminContainerComponent embeds code-based dashboards (BaseDashboard subclasses) inside the
 * Admin shells. BaseDashboard guarantees the loading screen is released when initDashboard()/
 * loadData() throws — it logs, emits its `Error` output, then fires NotifyLoadComplete() in a
 * finally. The container must LISTEN to that output, otherwise a failed embedded dashboard renders
 * as a blank content pane with a console-only error.
 */
import { describe, it, expect, vi } from 'vitest';

class MockEventEmitter<T = unknown> {
    private handlers: Array<(value: T) => void> = [];

    emit(value: T): void {
        for (const handler of this.handlers) {
            handler(value);
        }
    }

    subscribe(handler: (value: T) => void): { unsubscribe: () => void } {
        this.handlers.push(handler);
        return { unsubscribe: () => { this.handlers = this.handlers.filter(h => h !== handler); } };
    }
}

vi.mock('@angular/core', () => ({
    Directive: () => (target: Function) => target,
    ViewChild: () => () => undefined,
    Input: () => () => undefined,
    Output: () => () => undefined,
    EventEmitter: MockEventEmitter,
    ChangeDetectorRef: class {},
    ViewContainerRef: class {},
    inject: vi.fn(() => ({ detectChanges: vi.fn(), markForCheck: vi.fn() })),
}));

vi.mock('@memberjunction/ng-shared', () => ({
    BaseResourceComponent: class {
        Data: unknown = {};
        NotifyLoadComplete = vi.fn();
        ngOnInit = vi.fn();
        ngOnDestroy = vi.fn();
    },
    BaseDashboard: class {},
}));

const dashboardRow = { Name: 'Broken Admin Dashboard', Type: 'Code', DriverClass: 'BrokenAdminDashboard' };

vi.mock('@memberjunction/core-entities', () => ({
    DashboardEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            Dashboards: [dashboardRow],
        },
    },
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                GetRegistrationAsync: vi.fn(async () => ({ SubClass: class {} })),
            },
        },
    },
}));

vi.mock('@memberjunction/ng-ui-components', () => ({
    MJLeftNavItem: class {},
    MJLeftNavSection: class {},
}));

describe('BaseAdminContainerComponent embedded-dashboard error surfacing', () => {
    it('sets LoadError when an embedded dashboard emits Error after load', async () => {
        const { BaseAdminContainerComponent } = await import('../Admin/base-admin-container.component');

        class TestContainer extends BaseAdminContainerComponent {
            readonly ContainerTitle = 'Test';
            readonly ContainerIcon = 'fa-solid fa-flask';
            readonly ContainerSubtitle = 'Test container';
            readonly Sections = [];
        }

        const dashboardInstance = {
            Error: new MockEventEmitter<Error>(),
            Config: null as unknown,
            Refresh: vi.fn(),
        };

        const container = new TestContainer() as unknown as {
            LoadError: string | null;
            contentHost: { createComponent: ReturnType<typeof vi.fn> };
            createDashboardRef(name: string): Promise<unknown>;
        };
        container.contentHost = {
            createComponent: vi.fn(() => ({ instance: dashboardInstance })),
        };

        const ref = await container.createDashboardRef('Broken Admin Dashboard');

        expect(ref).not.toBeNull();
        expect(container.LoadError).toBeNull();

        // The embedded dashboard's guarded load failed — BaseDashboard emits Error and still
        // releases the loading screen, so this is the only signal the container gets.
        dashboardInstance.Error.emit(new Error('embedded loadData blew up'));

        expect(container.LoadError).toBe('embedded loadData blew up');
    });

    it('ignores an Error emitted after the embedded dashboard finished loading', async () => {
        const { BaseAdminContainerComponent } = await import('../Admin/base-admin-container.component');

        class TestContainer extends BaseAdminContainerComponent {
            readonly ContainerTitle = 'Test';
            readonly ContainerIcon = 'fa-solid fa-flask';
            readonly ContainerSubtitle = 'Test container';
            readonly Sections = [];
        }

        const dashboardInstance = {
            Error: new MockEventEmitter<Error>(),
            LoadCompleteEvent: null as (() => void) | null,
            Config: null as unknown,
            Refresh: vi.fn(),
        };

        const container = new TestContainer() as unknown as {
            LoadError: string | null;
            contentHost: { createComponent: ReturnType<typeof vi.fn> };
            createDashboardRef(name: string): Promise<unknown>;
        };
        container.contentHost = { createComponent: vi.fn(() => ({ instance: dashboardInstance })) };

        await container.createDashboardRef('Broken Admin Dashboard');

        // Initial load succeeded and signalled completion.
        dashboardInstance.LoadCompleteEvent!();
        expect(container.LoadError).toBeNull();

        // A later refresh fails. Sections are cached and kept alive, and LoadError only resets on
        // the next selectSection — so an unscoped subscription would pin a stale banner here,
        // possibly while a different section is on screen.
        dashboardInstance.Error.emit(new Error('post-mount refresh blew up'));

        expect(container.LoadError).toBeNull();
    });
});
