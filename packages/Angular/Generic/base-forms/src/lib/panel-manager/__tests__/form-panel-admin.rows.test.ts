import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';

/**
 * Turning a panel off is one of the things the manager does, so the way back INTO the
 * manager must not depend on a panel being on. Gating it on the rendering contributions
 * locked the door behind the user: the last panel switched off took the toolbar button
 * with it, and there was no way to switch it back on.
 */
type Row = { ID: string; EntityID: string | null; Status: string };
let rows: Row[] = [];
let throws = false;

const engine = {
    get Contributions(): Row[] {
        if (throws) throw new Error('engine unavailable');
        return rows;
    },
};

vi.mock('@memberjunction/core-entities', () => ({ InteractiveFormsEngine: { get Instance() { return engine; } } }));
vi.mock('@memberjunction/core', () => ({
    LogError: () => undefined,
    Metadata: class { public static Provider = null; },
}));
vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
    SafeJSONParse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
}));
vi.mock('../../panel-slot/collect-form-contribution-registrations', () => ({
    InvalidateFormContributionRegistrationCache: () => undefined,
    ParseClaimedFieldNames: () => [],
}));

import { FormPanelAdminService } from '../form-panel-admin.service';

const ENTITY = { ID: 'E1', Name: 'MoreCheese: Courses' } as unknown as EntityInfo;

describe('FormPanelAdminService.HasRowsForEntity', () => {
    let service: FormPanelAdminService;

    beforeEach(() => {
        rows = [];
        throws = false;
        service = new FormPanelAdminService();
    });

    it('is true for a panel that is on', () => {
        rows = [{ ID: 'r1', EntityID: 'E1', Status: 'Active' }];
        expect(service.HasRowsForEntity(ENTITY)).toBe(true);
    });

    it('stays true for a panel that has been turned off', () => {
        rows = [{ ID: 'r1', EntityID: 'E1', Status: 'Inactive' }];
        expect(service.HasRowsForEntity(ENTITY)).toBe(true);
    });

    it('stays true for a panel still saved as a draft', () => {
        rows = [{ ID: 'r1', EntityID: 'E1', Status: 'Pending' }];
        expect(service.HasRowsForEntity(ENTITY)).toBe(true);
    });

    it('is false for a form that has never carried one', () => {
        rows = [{ ID: 'r1', EntityID: 'E-OTHER', Status: 'Active' }];
        expect(service.HasRowsForEntity(ENTITY)).toBe(false);
    });

    it('is false without an entity, and without an engine', () => {
        rows = [{ ID: 'r1', EntityID: 'E1', Status: 'Active' }];
        expect(service.HasRowsForEntity(null)).toBe(false);
        throws = true;
        expect(service.HasRowsForEntity(ENTITY)).toBe(false);
    });
});
