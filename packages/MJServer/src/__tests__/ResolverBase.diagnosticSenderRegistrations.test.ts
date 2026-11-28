import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

class Probe extends ResolverBase {
    /** Asks whether an untracked entity with complete client OldValues must load the stored row. */
    public MustLoad(entityName: string): boolean {
        const user = new UserInfo(null, { ID: 'u-1', Name: 'Probe', Email: 'probe@example.test', IsActive: true, UserRoles: [] });
        return this.MustLoadTruthFromDatabase(
            new EntityInfo({ EntityFields: [], Name: entityName, TrackRecordChanges: false }),
            { OldValues___: [{ Key: 'Comments', Value: null }] },
            false,
            false,
            user
        );
    }
}

describe('ResolverBase.MustLoadTruthFromDatabase for diagnostic sender registrations', () => {
    it('always loads a sender registration, so client OldValues cannot hide a change to a guarded field', () => {
        const probe = new Probe();
        expect(probe.MustLoad('MJ: Diagnostic Sender Registrations')).toBe(true);
        expect(probe.MustLoad(' mj: diagnostic sender registrations ')).toBe(true);
    });
});
