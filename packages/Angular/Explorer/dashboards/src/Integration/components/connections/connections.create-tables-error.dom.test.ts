/**
 * #3321 — when the connector cannot list its source objects (its driver is not registered, say), the Create Tables
 * panel shows the server's message with a Retry instead of an empty list.
 */
import { describe, it, expect, vi } from 'vitest';
import { ConnectionsComponent } from './connections.component';

type PanelState = {
    SelectedSummary: { Integration: { ID: string } } | null;
    DetailEntityMaps: Array<{ ExternalObjectName: string }>;
    CreateTablesObjects: Array<{ Name: string }>;
    CreateTablesObjectsError: string | null;
    IsLoadingCreateTablesObjects: boolean;
    RetryCreateTablesObjects(): Promise<void>;
};

function panel(listSourceObjects: () => Promise<unknown>): PanelState {
    const c = Object.create(ConnectionsComponent.prototype) as PanelState & Record<string, unknown>;
    c['dataService'] = { ListSourceObjects: vi.fn(listSourceObjects) };
    c['cdr'] = { detectChanges: vi.fn() };
    c.SelectedSummary = { Integration: { ID: 'ci-1' } };
    c.DetailEntityMaps = [];
    c.CreateTablesObjects = [{ Name: 'stale' }];
    c.CreateTablesObjectsError = null;
    c.IsLoadingCreateTablesObjects = false;
    return c;
}

describe('Connections — Create Tables listing failure (#3321)', () => {
    it('a failed listing sets the error to the server message and clears the list', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const msg = "No connector class registered for 'PlaceholderConnector'. Check the @RegisterClass decorator.";
        const c = panel(async () => ({ Success: false, Message: msg }));
        await c.RetryCreateTablesObjects();
        expect(c.CreateTablesObjectsError).toBe(msg);
        expect(c.CreateTablesObjects).toEqual([]);
        expect(c.IsLoadingCreateTablesObjects).toBe(false);
    });

    it('a thrown error is shown too', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const c = panel(async () => { throw new Error('network down'); });
        await c.RetryCreateTablesObjects();
        expect(c.CreateTablesObjectsError).toBe('network down');
    });

    it('a successful retry clears the error', async () => {
        const c = panel(async () => ({ Success: true, Data: [{ Name: 'Accounts', Label: 'Accounts', AlreadyPersisted: false, IsCustom: false }] }));
        c.CreateTablesObjectsError = 'earlier failure';
        await c.RetryCreateTablesObjects();
        expect(c.CreateTablesObjectsError).toBeNull();
        expect(c.CreateTablesObjects.map(o => o.Name)).toEqual(['Accounts']);
    });
});
