// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other shell suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { WorkspaceConfiguration, WorkspaceTab } from '@memberjunction/ng-base-application';
import { ApplyDeepLinkToRestoredWorkspace } from './deep-link-workspace';
import { ShellComponent } from './shell.component';

/**
 * A PASTED DEEP LINK INTO AN ALREADY-OPEN TAB MUST WIN ON A FULL LOAD.
 *
 * Found by the BizApps Voting browser tier: `/app/Voting/Ballots?ballot=B2`, pasted while the
 * saved workspace already had the Ballots tab open on `ballot=B1`, reloaded onto B1. The restored
 * tab's saved params reached its component first; the URL's params only arrived later, as a
 * replayed tab request, by which time the component had initialised (and written back) B1.
 */

function tab(id: string, params?: Record<string, string>): WorkspaceTab {
    return {
        id, applicationId: 'app-voting', title: id, resourceTypeId: '', resourceRecordId: '', isPinned: true, sequence: 0,
        lastAccessedAt: '2026-10-01T10:00:00.000Z',
        configuration: { resourceType: 'Custom', appName: 'Voting', navItemName: id, ...(params ? { queryParams: params } : {}) }
    };
}

function config(tabs: WorkspaceTab[], activeTabId: string): WorkspaceConfiguration {
    return { version: 1, activeTabId, theme: 'light', preferences: { tabPosition: 'top', showTabIcons: true, autoSaveInterval: 0 }, tabs };
}

const NOW = '2026-10-13T12:00:00.000Z';

describe('ApplyDeepLinkToRestoredWorkspace', () => {
    it('replaces the restored tab\'s saved params with the URL\'s and activates it', () => {
        const saved = config([tab('Ballots', { ballot: 'B1' }), tab('Results')], 'Results');
        const out = ApplyDeepLinkToRestoredWorkspace(saved, 'Ballots', { ballot: 'B2' }, NOW);
        const ballots = out.tabs.find(t => t.id === 'Ballots');
        expect(ballots?.configuration['queryParams']).toEqual({ ballot: 'B2' });
        expect(out.activeTabId).toBe('Ballots');
        expect(ballots?.lastAccessedAt).toBe(NOW);
        expect(saved.tabs[0].configuration['queryParams'], 'the input is not mutated').toEqual({ ballot: 'B1' });
    });

    it('drops saved params the URL does not carry — the URL is the whole selection', () => {
        const out = ApplyDeepLinkToRestoredWorkspace(config([tab('Ballots', { ballot: 'B1', pane: 'audit' })], 'Ballots'), 'Ballots', { ballot: 'B2' }, NOW);
        expect(out.tabs[0].configuration['queryParams']).toEqual({ ballot: 'B2' });
    });

    it('a URL without params leaves the saved state alone (same object back)', () => {
        const saved = config([tab('Ballots', { ballot: 'B1' })], 'Ballots');
        expect(ApplyDeepLinkToRestoredWorkspace(saved, 'Ballots', {}, NOW)).toBe(saved);
    });

    it('returns the same object when the active tab already carries the URL\'s params', () => {
        const saved = config([tab('Ballots', { ballot: 'B2' })], 'Ballots');
        expect(ApplyDeepLinkToRestoredWorkspace(saved, 'Ballots', { ballot: 'B2' }, NOW)).toBe(saved);
    });

    it('an unknown tab id is a no-op', () => {
        const saved = config([tab('Ballots', { ballot: 'B1' })], 'Ballots');
        expect(ApplyDeepLinkToRestoredWorkspace(saved, 'Nope', { ballot: 'B2' }, NOW)).toBe(saved);
    });
});

describe('ShellComponent.applyStartupDeepLink — the PrepareConfiguration hook', () => {
    type Hook = { applyStartupDeepLink(config: WorkspaceConfiguration, url: string): Promise<WorkspaceConfiguration> };

    function shellMatching(match: WorkspaceTab | null): Hook {
        const shell = Object.create(ShellComponent.prototype) as ShellComponent;
        // findTabForUrl has its own coverage; fixing its answer keeps this about precedence alone.
        (shell as unknown as Record<string, unknown>)['findTabForUrl'] = async () => match;
        return shell as unknown as Hook;
    }

    it('writes the URL\'s params into the tab the URL resolves to', async () => {
        const ballots = tab('Ballots', { ballot: 'B1' });
        const saved = config([ballots, tab('Results')], 'Results');
        const out = await shellMatching(ballots).applyStartupDeepLink(saved, '/app/Voting/Ballots?ballot=B2');
        expect(out.activeTabId).toBe('Ballots');
        expect(out.tabs[0].configuration['queryParams']).toEqual({ ballot: 'B2' });
    });

    it('decodes the URL\'s params', async () => {
        const ballots = tab('Ballots', { ballot: 'B1' });
        const out = await shellMatching(ballots).applyStartupDeepLink(config([ballots], 'Ballots'), '/app/Voting/Ballots?name=Board%20Election');
        expect(out.tabs[0].configuration['queryParams']).toEqual({ name: 'Board Election' });
    });

    it('leaves the workspace alone when no restored tab matches (the resolver opens a new one)', async () => {
        const saved = config([tab('Results')], 'Results');
        expect(await shellMatching(null).applyStartupDeepLink(saved, '/app/Voting/Ballots?ballot=B2')).toBe(saved);
    });

    it('leaves the workspace alone for a deep link without params', async () => {
        const ballots = tab('Ballots', { ballot: 'B1' });
        const saved = config([ballots], 'Ballots');
        expect(await shellMatching(ballots).applyStartupDeepLink(saved, '/app/Voting/Ballots')).toBe(saved);
    });
});
