import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InjectionToken, inject, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent, HomeAppPinService, NavigationService } from '@memberjunction/ng-shared';
import { GoldenLayoutManager, WorkspaceStateManager, ApplicationManager } from '@memberjunction/ng-base-application';
import { TabContainerComponent } from './tab-container.component';

/**
 * Tab display-name resolution must attempt each resource driver at most once.
 *
 * Reading a resource's display name means instantiating its
 * `BaseResourceComponent` subclass outside any view, so its `inject()` field
 * initializers resolve against the *environment* injector. That injector cannot
 * supply node-injector-only tokens (`ElementRef`, `ChangeDetectorRef`,
 * `ViewContainerRef`) or component-scoped providers, so affected drivers throw
 * NG0201 — deterministically, every time.
 *
 * The uncached version ran on every tab add and every tab reload and logged the
 * full Error each time. In run-20260730T200139Z that produced 50,153 console
 * errors; the argument handles Playwright retained for them consumed 6.46 GB of
 * the test runner's heap (82% of it) and OOM-killed a 155-test suite two tests
 * from the end. These specs lock the memoization that stops it.
 */

const UNPROVIDED = new InjectionToken<string>('deliberately-not-provided');

let constructions: string[];

/** A driver that instantiates cleanly and reports a name. */
class WorkingDriver {
    constructor() {
        constructions.push('working');
    }
    async GetResourceDisplayName(): Promise<string> {
        return 'Resolved Name';
    }
}

/**
 * A driver that fails exactly the way real ones do: an `inject()` field
 * initializer for a token the environment injector has no provider for.
 */
class NodeInjectorOnlyDriver {
    // Field initializers run in declaration order, before the constructor body —
    // so record the ATTEMPT here, because the `inject()` below throws and the
    // constructor body is never reached.
    private attempt = constructions.push('broken');
    private dep = inject(UNPROVIDED);
    async GetResourceDisplayName(): Promise<string> {
        return `${this.attempt}:${this.dep}`;
    }
}

/** Stubs for the constructor + `inject()` dependencies the component pulls in. */
function providers() {
    return [
        { provide: GoldenLayoutManager, useValue: { UpdateTabStyle: vi.fn(), AddTab: vi.fn(), MarkTabNotLoaded: vi.fn() } },
        { provide: WorkspaceStateManager, useValue: { UpdateTabTitle: vi.fn(), GetConfiguration: () => null } },
        { provide: ApplicationManager, useValue: {} },
        { provide: HomeAppPinService, useValue: {} },
        { provide: NavigationService, useValue: {} },
    ];
}

/**
 * Build the component without rendering it. It uses `inject()` field
 * initializers, so construction has to happen inside an injection context.
 */
function makeComponent(): TabContainerComponent {
    return TestBed.runInInjectionContext(
        () =>
            new TabContainerComponent(
                TestBed.inject(GoldenLayoutManager),
                TestBed.inject(WorkspaceStateManager),
                TestBed.inject(ApplicationManager),
                { attachView: vi.fn(), detachView: vi.fn() } as never,
                TestBed.inject(EnvironmentInjector),
                { detectChanges: vi.fn(), markForCheck: vi.fn() } as never
            )
    );
}

/** `resolveDisplayNameProvider` is private; reach it explicitly rather than by rendering. */
function resolve(component: TabContainerComponent, driverClass: string): Promise<BaseResourceComponent | null> {
    return (
        component as unknown as {
            resolveDisplayNameProvider(d: string): Promise<BaseResourceComponent | null>;
        }
    ).resolveDisplayNameProvider(driverClass);
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    constructions = [];
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers() });
    MJGlobal.Instance.ClassFactory.Register(BaseResourceComponent, WorkingDriver, 'TestWorkingDriver');
    MJGlobal.Instance.ClassFactory.Register(BaseResourceComponent, NodeInjectorOnlyDriver, 'TestBrokenDriver');
});

afterEach(() => {
    warn.mockRestore();
});

describe('TabContainerComponent display-name provider resolution', () => {
    it('resolves a working driver and returns something that reports a name', async () => {
        const component = makeComponent();
        const provider = await resolve(component, 'TestWorkingDriver');

        expect(provider).not.toBeNull();
        await expect(provider!.GetResourceDisplayName({} as never)).resolves.toBe('Resolved Name');
    });

    it('instantiates a working driver only once across many lookups', async () => {
        const component = makeComponent();
        for (let i = 0; i < 25; i++) {
            await resolve(component, 'TestWorkingDriver');
        }
        expect(constructions.filter((c) => c === 'working')).toHaveLength(1);
    });

    it('returns null for a driver that cannot be built outside a view', async () => {
        const component = makeComponent();
        expect(await resolve(component, 'TestBrokenDriver')).toBeNull();
    });

    /**
     * The regression this whole change exists for: 50,153 identical console
     * errors, one per tab add/reload, instead of one.
     */
    it('warns once per broken driver no matter how many tabs ask', async () => {
        const component = makeComponent();
        for (let i = 0; i < 200; i++) {
            expect(await resolve(component, 'TestBrokenDriver')).toBeNull();
        }

        expect(warn).toHaveBeenCalledTimes(1);
        // One attempt only — a retry per tab is what produced the flood.
        expect(constructions.filter((c) => c === 'broken')).toHaveLength(1);
    });

    it('names the driver and the reason, without logging the Error object itself', async () => {
        const component = makeComponent();
        await resolve(component, 'TestBrokenDriver');

        const [message, ...rest] = warn.mock.calls[0];
        expect(message).toContain('TestBrokenDriver');
        expect(message).toContain('cannot be instantiated outside a view');
        // Passing an Error to console.* makes the browser (and Playwright) retain
        // it with its full stack — that retention was the 6.5 GB.
        expect(rest).toHaveLength(0);
        expect(message).not.toContain('\n');
    });

    it('caches per driver class, so one broken driver does not disable the others', async () => {
        const component = makeComponent();
        expect(await resolve(component, 'TestBrokenDriver')).toBeNull();
        expect(await resolve(component, 'TestWorkingDriver')).not.toBeNull();
        expect(await resolve(component, 'TestBrokenDriver')).toBeNull();

        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('returns null for an unregistered driver without warning', async () => {
        const component = makeComponent();
        expect(await resolve(component, 'NoSuchDriverAnywhere')).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });
});
