import { describe, it, expect, beforeEach } from 'vitest';
import {
    PrefsStorage,
    PrefKeys,
    APPEARANCE_CYCLE,
    GetAppearance,
    CycleAppearance,
    SetDefaultAgent,
    GetDefaultAgentId,
    GetDefaultAgentName,
} from '@/data/preferences';

// PrefsStorage is the in-memory MMKV stub from setup.ts; reset between tests.
beforeEach(() => {
    PrefsStorage.clearAll();
});

describe('preferences (MMKV-backed)', () => {
    describe('GetAppearance', () => {
        it('defaults to "system" when unset', () => {
            expect(GetAppearance()).toBe('system');
        });

        it('returns a persisted valid value', () => {
            PrefsStorage.set(PrefKeys.appearance, 'dark');
            expect(GetAppearance()).toBe('dark');
        });

        it('falls back to "system" for an invalid persisted value', () => {
            PrefsStorage.set(PrefKeys.appearance, 'chartreuse');
            expect(GetAppearance()).toBe('system');
        });
    });

    describe('CycleAppearance', () => {
        it('advances System -> Light -> Dark -> System and persists each step', () => {
            expect(GetAppearance()).toBe('system');
            expect(CycleAppearance()).toBe('light');
            expect(GetAppearance()).toBe('light');
            expect(CycleAppearance()).toBe('dark');
            expect(GetAppearance()).toBe('dark');
            expect(CycleAppearance()).toBe('system');
            expect(GetAppearance()).toBe('system');
        });

        it('follows the declared APPEARANCE_CYCLE order', () => {
            const seen: string[] = [GetAppearance()];
            for (let i = 0; i < APPEARANCE_CYCLE.length; i++) seen.push(CycleAppearance());
            // After a full cycle we should be back to the start.
            expect(seen[0]).toBe(seen[seen.length - 1]);
            expect(new Set(seen)).toEqual(new Set(APPEARANCE_CYCLE));
        });
    });

    describe('default agent', () => {
        it('returns undefined for both id and name when unset', () => {
            expect(GetDefaultAgentId()).toBeUndefined();
            expect(GetDefaultAgentName()).toBeUndefined();
        });

        it('persists and reads back the default agent id + name', () => {
            SetDefaultAgent('agent-123', 'Sage');
            expect(GetDefaultAgentId()).toBe('agent-123');
            expect(GetDefaultAgentName()).toBe('Sage');
        });

        it('overwrites a previously set default agent', () => {
            SetDefaultAgent('agent-123', 'Sage');
            SetDefaultAgent('agent-456', 'Research');
            expect(GetDefaultAgentId()).toBe('agent-456');
            expect(GetDefaultAgentName()).toBe('Research');
        });
    });
});
