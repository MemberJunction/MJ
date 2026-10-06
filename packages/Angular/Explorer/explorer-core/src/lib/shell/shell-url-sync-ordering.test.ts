// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ShellComponent } from './shell.component';

/**
 * A URL SYNC MUST NOT OVERRIDE A NEWER ACTIVATION.
 *
 * Opening a new record activates its tab immediately and writes the record's url a few milliseconds
 * later. A `NavigationEnd` for the PREVIOUS url is still in flight; when it lands,
 * `findTabForUrl` matches the nav tab and switching back to it hides the records region — with a
 * fully rendered form inside it — permanently, because that region cannot re-activate itself once
 * it stops being shown.
 *
 * The guard compares TIMES, not tab kinds, and these tests are written to hold it to that. A
 * "never leave a record tab" rule would pass the first test and break the second, which is the
 * whole reason the implementation does not use one.
 *
 * WHAT IS PINNED, beyond the comparison itself:
 *   - the re-read. The guard calls `GetConfiguration()` a SECOND time rather than reusing the
 *     config captured at entry, because the activation it is looking for may have happened after
 *     that capture. Reusing the first read is the obvious simplification and it silently restores
 *     the bug, so one test drives the two reads apart and fails if they are collapsed.
 *   - failing OPEN. An absent or unparseable `lastAccessedAt` must not block the sync: an
 *     unreadable timestamp is not evidence that an activation was newer.
 *
 * `Object.create` holds the component without standing up Angular, as `shell-global-keydown` and
 * `shell-chrome-policy` already do here; every member the method touches is shadowed explicitly.
 */

type Tab = { id: string; lastAccessedAt?: string };
type Config = { tabs: Tab[]; activeTabId: string };

interface Harness {
    /** Runs the private method under test. */
    sync: (navigatedAt: number) => Promise<void>;
    setActiveTab: ReturnType<typeof vi.fn>;
    reads: number;
}

/**
 * @param configs the value each successive `GetConfiguration()` call returns. A single entry is
 *                reused for every call, which is the ordinary case; two entries drive the entry
 *                read and the guard's re-read apart.
 * @param matching the tab `findTabForUrl` resolves to.
 */
function harness(configs: Config[], matching: Tab): Harness {
    const shell = Object.create(ShellComponent.prototype) as ShellComponent;
    const setActiveTab = vi.fn();
    let reads = 0;

    const open = shell as unknown as Record<string, unknown>;
    open['workspaceManager'] = {
        GetConfiguration: () => configs[Math.min(reads++, configs.length - 1)],
        SetActiveTab: setActiveTab,
    };
    // Shadowed rather than exercised: which tab a url resolves to is a separate concern with its
    // own tests, and fixing it here keeps these tests about ordering alone.
    open['findTabForUrl'] = async () => matching;

    return {
        sync: (navigatedAt: number) =>
            (shell as unknown as {
                syncWorkspaceWithUrl(url: string, navigatedAt: number): Promise<void>;
            }).syncWorkspaceWithUrl('/nav/deals', navigatedAt),
        setActiveTab,
        get reads() {
            return reads;
        },
    };
}

const NAV_TAB: Tab = { id: 'tab-nav' };
const AT = (ms: number) => new Date(ms).toISOString();

describe('syncWorkspaceWithUrl — a stale url must not override a newer activation', () => {
    it('yields when the active tab was activated AFTER this url became current', async () => {
        const h = harness(
            [{ tabs: [NAV_TAB, { id: 'tab-record', lastAccessedAt: AT(5_000) }], activeTabId: 'tab-record' }],
            NAV_TAB,
        );
        await h.sync(4_000);
        expect(h.setActiveTab, 'the newer activation wins, so nothing is switched').not.toHaveBeenCalled();
    });

    /**
     * THE CASE A TAB-KIND GUARD WOULD BREAK. Back/forward navigation reaches this same code, and
     * there the navigation genuinely is newer than the activation — so it must still move the tab.
     */
    it('activates when the navigation is NEWER than the activation — back/forward still works', async () => {
        const h = harness(
            [{ tabs: [NAV_TAB, { id: 'tab-record', lastAccessedAt: AT(4_000) }], activeTabId: 'tab-record' }],
            NAV_TAB,
        );
        await h.sync(5_000);
        expect(h.setActiveTab).toHaveBeenCalledWith('tab-nav');
    });

    it('activates when the two are simultaneous — only a STRICTLY newer activation yields', async () => {
        const h = harness(
            [{ tabs: [NAV_TAB, { id: 'tab-record', lastAccessedAt: AT(5_000) }], activeTabId: 'tab-record' }],
            NAV_TAB,
        );
        await h.sync(5_000);
        expect(h.setActiveTab).toHaveBeenCalledWith('tab-nav');
    });
});

describe('an unreadable activation time is not evidence, so the sync proceeds', () => {
    it('activates when the active tab carries no lastAccessedAt', async () => {
        const h = harness([{ tabs: [NAV_TAB, { id: 'tab-record' }], activeTabId: 'tab-record' }], NAV_TAB);
        await h.sync(5_000);
        expect(h.setActiveTab).toHaveBeenCalledWith('tab-nav');
    });

    it('activates when lastAccessedAt does not parse', async () => {
        const h = harness(
            [{ tabs: [NAV_TAB, { id: 'tab-record', lastAccessedAt: 'not a date' }], activeTabId: 'tab-record' }],
            NAV_TAB,
        );
        await h.sync(5_000);
        expect(h.setActiveTab).toHaveBeenCalledWith('tab-nav');
    });
});

/**
 * THE RE-READ IS THE MECHANISM, not an accident of style.
 *
 * The activation this guard exists to respect can land BETWEEN the read at the top of the method
 * and the guard itself — that few-millisecond window is the entire defect. So the guard asks the
 * workspace manager again. Collapsing the two reads into one is the obvious tidy-up and it restores
 * the bug without touching the comparison, which is why it is pinned separately.
 */
describe('the guard re-reads the configuration rather than trusting the one it entered with', () => {
    it('sees an activation that landed after the method began', async () => {
        const stale: Config = {
            tabs: [NAV_TAB, { id: 'tab-record', lastAccessedAt: AT(1_000) }],
            activeTabId: 'tab-record',
        };
        const fresh: Config = {
            tabs: [NAV_TAB, { id: 'tab-record', lastAccessedAt: AT(9_000) }],
            activeTabId: 'tab-record',
        };
        const h = harness([stale, fresh], NAV_TAB);

        await h.sync(5_000);

        expect(h.reads, 'the configuration must be read twice').toBeGreaterThanOrEqual(2);
        expect(
            h.setActiveTab,
            'the re-read shows an activation newer than the navigation, so the sync must yield',
        ).not.toHaveBeenCalled();
    });
});

/**
 * THE STAMP IS TAKEN WHETHER OR NOT THE SHELL IS READY, which is the other half of the fix.
 *
 * `lastNavigationAt` is seeded at construction and updated on every `NavigationEnd`. That update sits
 * OUTSIDE the `if (this.Initialized)` guard on purpose. Move it inside and a navigation that lands
 * before the shell is ready leaves the stamp at its construction value — so the startup sync, which
 * takes `navigatedAt` from the default parameter, compares against a time older than ANY activation,
 * the guard yields, and the shell stops syncing the workspace to a deep-linked url. The tests above
 * all pass with that regression in place, because none of them drives the subscription.
 *
 * ── WHY THIS READS THE SOURCE ───────────────────────────────────────────────────────────────────
 *
 * The subscription is set up inline inside `InitializeShell()`, a ~230-line method that reaches a
 * large collaborator surface. Driving it would mean shadowing most of that, and extracting the
 * callback to make it reachable would be a production change to a fix that is already under review.
 * What is actually at risk is an ORDERING — the assignment before the guard — and ordering is exactly
 * what a source read can hold without rendering anything.
 *
 * Comments are stripped first: the assignment is introduced by a comment that explains it, and an
 * index comparison over the raw text would be measuring prose.
 */
describe('the navigation stamp is recorded before the readiness guard', () => {
    const SOURCE = readFileSync(new URL('./shell.component.ts', import.meta.url), 'utf8').replace(
        /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
        '',
    );

    /** The NavigationEnd subscriber's body — bounded so another `Initialized` check cannot satisfy it. */
    const block = (() => {
        const at = SOURCE.indexOf('this.lastNavigationAt = Date.now()');
        expect(at, 'the stamp must be assigned on a navigation').toBeGreaterThan(-1);
        return SOURCE.slice(at, at + 400);
    })();

    it('assigns the stamp before testing Initialized', () => {
        const guard = block.indexOf('this.Initialized');
        expect(guard, 'the readiness guard must follow the stamp in the same callback').toBeGreaterThan(0);
    });

    it('passes that same stamp to the sync, rather than re-reading the clock', () => {
        // Re-reading Date.now() at the call site would time the sync, not the navigation it reacts to.
        expect(block).toContain('this.lastNavigationAt)');
    });
});
