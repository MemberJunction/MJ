import { describe, it, expect, vi } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { MJListEntity, MJListEntityExtended } from '@memberjunction/core-entities';
import { MJListEntityServer } from '@memberjunction/core-entities-server';
import { GraphTestListEntity } from '../checks/entity-graph.checks';

describe('GraphTestListEntity ClassFactory inheritance chain', () => {
    it('extends MJListEntityServer -> MJListEntityExtended -> MJListEntity with no sibling ClassFactory collisions for MJ: Lists', () => {
        expect(GraphTestListEntity.prototype instanceof MJListEntityServer).toBe(true);
        expect(GraphTestListEntity.prototype instanceof MJListEntityExtended).toBe(true);
        expect(GraphTestListEntity.prototype instanceof MJListEntity).toBe(true);

        const factory = MJGlobal.Instance.ClassFactory;
        const registrations = factory.GetAllRegistrations(BaseEntity, 'MJ: Lists');
        expect(registrations.length).toBeGreaterThanOrEqual(4);

        for (const reg of registrations) {
            const isLinear =
                reg.SubClass === GraphTestListEntity ||
                GraphTestListEntity.prototype instanceof reg.SubClass;
            expect(
                isLinear,
                `Expected ${reg.SubClass.name} to be in the linear ancestor chain of GraphTestListEntity`
            ).toBe(true);
        }

        expect(factory.GetRegistration(BaseEntity, 'MJ: Lists')?.SubClass).toBe(GraphTestListEntity);
    });

    it('emits zero ClassFactory.Register unrelated-class warnings when registering after MJListEntityServer', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const factory = MJGlobal.Instance.ClassFactory;
            factory.Register(BaseEntity, GraphTestListEntity, 'MJ: Lists');
            const collisionWarnings = warnSpy.mock.calls
                .map(args => String(args[0] ?? ''))
                .filter(msg => msg.includes('ClassFactory.Register') && msg.includes('unrelated class'));
            expect(collisionWarnings).toEqual([]);
        } finally {
            warnSpy.mockRestore();
        }
    });
});
