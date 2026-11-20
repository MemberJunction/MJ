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
            { OldValues___: [{ Key: 'Status', Value: null }] },
            false,
            false,
            user
        );
    }
}

describe('ResolverBase.MustLoadTruthFromDatabase for entities with owner checks on stored values', () => {
    it('always loads a resource permission, so its grant rule compares against the stored row', () => {
        expect(new Probe().MustLoad('MJ: Resource Permissions')).toBe(true);
    });

    it('always loads a user routine, so its owner rule compares against the stored row', () => {
        expect(new Probe().MustLoad('MJ: User Routines')).toBe(true);
    });
});
