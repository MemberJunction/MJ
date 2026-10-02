import { describe, it, expect, vi } from 'vitest';

// control.ts imports IRemoteBrowserProviderFeatures only as a TYPE (erased at compile). Stub the
// core-entities package so the module graph resolves without pulling heavy deps.
vi.mock('@memberjunction/core-entities', () => ({}));

import {
    IsControlModeSupported,
    ResolveControlStrategy,
    RemoteBrowserControlMode,
} from '../control';
import { IRemoteBrowserProviderFeatures } from '../remote-browser-features';

describe('isControlModeSupported', () => {
    const allModes: RemoteBrowserControlMode[] = ['AgentOnly', 'ViewOnly', 'Collaborative'];

    it('AgentOnly is supported regardless of features', () => {
        expect(IsControlModeSupported('AgentOnly', {})).toBe(true);
        expect(IsControlModeSupported('AgentOnly', { LiveView: false, HumanTakeover: false })).toBe(true);
        expect(IsControlModeSupported('AgentOnly', { LiveView: true, HumanTakeover: true })).toBe(true);
    });

    it('ViewOnly requires LiveView', () => {
        expect(IsControlModeSupported('ViewOnly', {})).toBe(false);
        expect(IsControlModeSupported('ViewOnly', { LiveView: false })).toBe(false);
        expect(IsControlModeSupported('ViewOnly', { LiveView: true })).toBe(true);
        // HumanTakeover alone is not enough
        expect(IsControlModeSupported('ViewOnly', { HumanTakeover: true })).toBe(false);
    });

    it('Collaborative requires both LiveView and HumanTakeover', () => {
        expect(IsControlModeSupported('Collaborative', {})).toBe(false);
        expect(IsControlModeSupported('Collaborative', { LiveView: true })).toBe(false);
        expect(IsControlModeSupported('Collaborative', { HumanTakeover: true })).toBe(false);
        expect(IsControlModeSupported('Collaborative', { LiveView: true, HumanTakeover: true })).toBe(true);
        expect(IsControlModeSupported('Collaborative', { LiveView: false, HumanTakeover: true })).toBe(false);
    });

    it('truth table — every mode x every relevant feature combination', () => {
        const combos: Array<{ LiveView: boolean; HumanTakeover: boolean }> = [
            { LiveView: false, HumanTakeover: false },
            { LiveView: true, HumanTakeover: false },
            { LiveView: false, HumanTakeover: true },
            { LiveView: true, HumanTakeover: true },
        ];
        for (const mode of allModes) {
            for (const f of combos) {
                const features: IRemoteBrowserProviderFeatures = { ...f };
                const expected =
                    mode === 'AgentOnly'
                        ? true
                        : mode === 'ViewOnly'
                          ? f.LiveView
                          : f.LiveView && f.HumanTakeover;
                expect(IsControlModeSupported(mode, features)).toBe(expected);
            }
        }
    });
});

describe('resolveControlStrategy', () => {
    it("returns 'NativeAI' only when NativeAIControl is set and preferred is not 'ComputerUse'", () => {
        expect(ResolveControlStrategy({ NativeAIControl: true })).toBe('NativeAI');
        expect(ResolveControlStrategy({ NativeAIControl: true }, 'NativeAI')).toBe('NativeAI');
    });

    it("an explicit 'ComputerUse' preference suppresses native delegation even when supported", () => {
        expect(ResolveControlStrategy({ NativeAIControl: true }, 'ComputerUse')).toBe('ComputerUse');
    });

    it("returns 'ComputerUse' when NativeAIControl is absent", () => {
        expect(ResolveControlStrategy({})).toBe('ComputerUse');
        expect(ResolveControlStrategy({ RawCdpControl: true })).toBe('ComputerUse');
        expect(ResolveControlStrategy({ NativeAIControl: false })).toBe('ComputerUse');
    });

    it("preferring 'NativeAI' on a backend without NativeAIControl still falls back to 'ComputerUse'", () => {
        expect(ResolveControlStrategy({ RawCdpControl: true }, 'NativeAI')).toBe('ComputerUse');
        expect(ResolveControlStrategy({}, 'NativeAI')).toBe('ComputerUse');
    });
});
