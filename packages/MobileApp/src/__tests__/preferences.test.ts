import { describe, it, expect, beforeEach } from 'vitest';
import {
    prefsStorage,
    PrefKeys,
    APPEARANCE_CYCLE,
    getAppearance,
    cycleAppearance,
    setDefaultAgent,
    getDefaultAgentId,
    getDefaultAgentName,
} from '@/data/preferences';

// prefsStorage is the in-memory MMKV stub from setup.ts; reset between tests.
beforeEach(() => {
    prefsStorage.clearAll();
});

describe('preferences (MMKV-backed)', () => {
    describe('getAppearance', () => {
        it('defaults to "system" when unset', () => {
            expect(getAppearance()).toBe('system');
        });

        it('returns a persisted valid value', () => {
            prefsStorage.set(PrefKeys.appearance, 'dark');
            expect(getAppearance()).toBe('dark');
        });

        it('falls back to "system" for an invalid persisted value', () => {
            prefsStorage.set(PrefKeys.appearance, 'chartreuse');
            expect(getAppearance()).toBe('system');
        });
    });

    describe('cycleAppearance', () => {
        it('advances System -> Light -> Dark -> System and persists each step', () => {
            expect(getAppearance()).toBe('system');
            expect(cycleAppearance()).toBe('light');
            expect(getAppearance()).toBe('light');
            expect(cycleAppearance()).toBe('dark');
            expect(getAppearance()).toBe('dark');
            expect(cycleAppearance()).toBe('system');
            expect(getAppearance()).toBe('system');
        });

        it('follows the declared APPEARANCE_CYCLE order', () => {
            const seen: string[] = [getAppearance()];
            for (let i = 0; i < APPEARANCE_CYCLE.length; i++) seen.push(cycleAppearance());
            // After a full cycle we should be back to the start.
            expect(seen[0]).toBe(seen[seen.length - 1]);
            expect(new Set(seen)).toEqual(new Set(APPEARANCE_CYCLE));
        });
    });

    describe('default agent', () => {
        it('returns undefined for both id and name when unset', () => {
            expect(getDefaultAgentId()).toBeUndefined();
            expect(getDefaultAgentName()).toBeUndefined();
        });

        it('persists and reads back the default agent id + name', () => {
            setDefaultAgent('agent-123', 'Sage');
            expect(getDefaultAgentId()).toBe('agent-123');
            expect(getDefaultAgentName()).toBe('Sage');
        });

        it('overwrites a previously set default agent', () => {
            setDefaultAgent('agent-123', 'Sage');
            setDefaultAgent('agent-456', 'Research');
            expect(getDefaultAgentId()).toBe('agent-456');
            expect(getDefaultAgentName()).toBe('Research');
        });
    });
});
