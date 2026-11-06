import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJNumberPoolEntity, MJPhoneNumberEntity, MJInteractionEntity } from '@memberjunction/core-entities';
import { NumberPoolSelector } from '../telephony/numberPoolSelector.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;

describe('NumberPoolSelector', () => {
    let selector: NumberPoolSelector;

    beforeEach(() => {
        selector = NumberPoolSelector.Instance;
        selector.ResetPointers();
    });

    function mockProvider(
        pool: Partial<MJNumberPoolEntity> | null,
        phoneNumbers: Partial<MJPhoneNumberEntity>[],
        activeInteractions: Partial<MJInteractionEntity>[] = [],
    ): IMetadataProvider {
        const provider = {
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Number Pools') {
                    return {
                        Success: true,
                        Results: pool ? [pool as MJNumberPoolEntity] : [],
                    };
                }
                if (params.EntityName === 'MJ: Phone Numbers') {
                    return {
                        Success: true,
                        Results: phoneNumbers as MJPhoneNumberEntity[],
                    };
                }
                if (params.EntityName === 'MJ: Interactions') {
                    return {
                        Success: true,
                        Results: activeInteractions as MJInteractionEntity[],
                    };
                }
                return { Success: true, Results: [] };
            }),
        } as unknown as IMetadataProvider;

        return provider;
    }

    describe('RoundRobin selection', () => {
        it('evenly rotates through available active numbers', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'pool-rr-1',
                Name: 'Sales Outbound',
                SelectionRule: 'RoundRobin',
                MaxConcurrentPerNumber: null,
            };
            const numbers: Partial<MJPhoneNumberEntity>[] = [
                { ID: 'num-1', Number: '+18005550101', Status: 'Active' },
                { ID: 'num-2', Number: '+18005550102', Status: 'Active' },
                { ID: 'num-3', Number: '+18005550103', Status: 'Active' },
            ];

            const provider = mockProvider(pool, numbers);

            const first = await selector.SelectNumber({
                NumberPoolID: 'pool-rr-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(first?.PhoneNumberID).toBe('num-1');
            expect(first?.Number).toBe('+18005550101');

            const second = await selector.SelectNumber({
                NumberPoolID: 'pool-rr-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(second?.PhoneNumberID).toBe('num-2');

            const third = await selector.SelectNumber({
                NumberPoolID: 'pool-rr-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(third?.PhoneNumberID).toBe('num-3');

            // Wraps back to first
            const fourth = await selector.SelectNumber({
                NumberPoolID: 'pool-rr-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(fourth?.PhoneNumberID).toBe('num-1');
        });
    });

    describe('LocalPresence selection', () => {
        it('prefers a number matching the area code of the callee', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'pool-lp-1',
                Name: 'Local Presence Pool',
                SelectionRule: 'LocalPresence',
                MaxConcurrentPerNumber: null,
            };
            const numbers: Partial<MJPhoneNumberEntity>[] = [
                { ID: 'num-ny', Number: '+12125550100', Status: 'Active' },
                { ID: 'num-sf', Number: '+14155550199', Status: 'Active' },
                { ID: 'num-chi', Number: '+13125550150', Status: 'Active' },
            ];

            const provider = mockProvider(pool, numbers);

            // Call to San Francisco (+1415...)
            const result = await selector.SelectNumber({
                NumberPoolID: 'pool-lp-1',
                ToNumber: '+14158889999',
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(result?.PhoneNumberID).toBe('num-sf');
            expect(result?.Number).toBe('+14155550199');
        });

        it('falls back to round-robin if no area code match exists', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'pool-lp-2',
                Name: 'Local Presence Pool',
                SelectionRule: 'LocalPresence',
                MaxConcurrentPerNumber: null,
            };
            const numbers: Partial<MJPhoneNumberEntity>[] = [
                { ID: 'num-ny', Number: '+12125550100', Status: 'Active' },
                { ID: 'num-sf', Number: '+14155550199', Status: 'Active' },
            ];

            const provider = mockProvider(pool, numbers);

            // Call to Miami (+1305...)
            const result = await selector.SelectNumber({
                NumberPoolID: 'pool-lp-2',
                ToNumber: '+13055550188',
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(result).not.toBeNull();
            expect(['num-ny', 'num-sf']).toContain(result?.PhoneNumberID);
        });
    });

    describe('Random selection', () => {
        it('picks a valid number from the candidates', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'pool-rnd-1',
                Name: 'Random Pool',
                SelectionRule: 'Random',
                MaxConcurrentPerNumber: null,
            };
            const numbers: Partial<MJPhoneNumberEntity>[] = [
                { ID: 'num-1', Number: '+18005550101', Status: 'Active' },
                { ID: 'num-2', Number: '+18005550102', Status: 'Active' },
            ];

            const provider = mockProvider(pool, numbers);

            const result = await selector.SelectNumber({
                NumberPoolID: 'pool-rnd-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(result).not.toBeNull();
            expect(['num-1', 'num-2']).toContain(result?.PhoneNumberID);
        });
    });

    describe('Concurrency ceiling (MaxConcurrentPerNumber)', () => {
        it('skips numbers that have reached or exceeded the ceiling', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'pool-cap-1',
                Name: 'Capped Pool',
                SelectionRule: 'RoundRobin',
                MaxConcurrentPerNumber: 2,
            };
            const numbers: Partial<MJPhoneNumberEntity>[] = [
                { ID: 'num-1', Number: '+18005550101', Status: 'Active' },
                { ID: 'num-2', Number: '+18005550102', Status: 'Active' },
            ];

            // num-1 has 2 active interactions (at cap: 2)
            // num-2 has 1 active interaction (below cap: 2)
            const activeInteractions: Partial<MJInteractionEntity>[] = [
                { ID: 'int-1', PhoneNumberID: 'num-1', Status: 'Active' },
                { ID: 'int-2', PhoneNumberID: 'num-1', Status: 'Active' },
                { ID: 'int-3', PhoneNumberID: 'num-2', Status: 'Active' },
            ];

            const provider = mockProvider(pool, numbers, activeInteractions);

            const result = await selector.SelectNumber({
                NumberPoolID: 'pool-cap-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });

            // Must pick num-2 because num-1 is at cap
            expect(result?.PhoneNumberID).toBe('num-2');
        });

        it('returns null when all numbers in the pool are at capacity', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'pool-full-1',
                Name: 'Fully Saturated Pool',
                SelectionRule: 'RoundRobin',
                MaxConcurrentPerNumber: 1,
            };
            const numbers: Partial<MJPhoneNumberEntity>[] = [
                { ID: 'num-1', Number: '+18005550101', Status: 'Active' },
                { ID: 'num-2', Number: '+18005550102', Status: 'Active' },
            ];

            const activeInteractions: Partial<MJInteractionEntity>[] = [
                { ID: 'int-1', PhoneNumberID: 'num-1', Status: 'Active' },
                { ID: 'int-2', PhoneNumberID: 'num-2', Status: 'Active' },
            ];

            const provider = mockProvider(pool, numbers, activeInteractions);

            const result = await selector.SelectNumber({
                NumberPoolID: 'pool-full-1',
                ContextUser: USER,
                MetadataProvider: provider,
            });

            expect(result).toBeNull();
        });
    });

    describe('Edge cases', () => {
        it('returns null if pool does not exist', async () => {
            const provider = mockProvider(null, []);
            const result = await selector.SelectNumber({
                NumberPoolID: 'missing-pool',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(result).toBeNull();
        });

        it('returns null if pool has no active numbers', async () => {
            const pool: Partial<MJNumberPoolEntity> = {
                ID: 'empty-pool',
                Name: 'Empty',
                SelectionRule: 'RoundRobin',
            };
            const provider = mockProvider(pool, []);
            const result = await selector.SelectNumber({
                NumberPoolID: 'empty-pool',
                ContextUser: USER,
                MetadataProvider: provider,
            });
            expect(result).toBeNull();
        });
    });
});
