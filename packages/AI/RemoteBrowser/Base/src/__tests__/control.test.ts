import { describe, it, expect, vi } from 'vitest';

// control.ts imports IRemoteBrowserProviderFeatures only as a TYPE (erased at compile). Stub the
// core-entities package so the module graph resolves without pulling heavy deps.
vi.mock('@memberjunction/core-entities', () => ({}));

import {
    isControlModeSupported,
    resolveControlStrategy,
    RemoteBrowserControlMode,
} from '../control';
import { IRemoteBrowserProviderFeatures } from '../remote-browser-features';

describe('isControlModeSupported', () => {
    const allModes: RemoteBrowserControlMode[] = ['AgentOnly', 'ViewOnly', 'Collaborative'];

    it('AgentOnly is supported regardless of features', () => {
        expect(isControlModeSupported('AgentOnly', {})).toBe(true);
        expect(isControlModeSupported('AgentOnly', { LiveView: false, HumanTakeover: false })).toBe(true);
        expect(isControlModeSupported('AgentOnly', { LiveView: true, HumanTakeover: true })).toBe(true);
    });

    it('ViewOnly requires LiveView', () => {
        expect(isControlModeSupported('ViewOnly', {})).toBe(false);
        expect(isControlModeSupported('ViewOnly', { LiveView: false })).toBe(false);
        expect(isControlModeSupported('ViewOnly', { LiveView: true })).toBe(true);
        // HumanTakeover alone is not enough
        expect(isControlModeSupported('ViewOnly', { HumanTakeover: true })).toBe(false);
    });

    it('Collaborative requires both LiveView and HumanTakeover', () => {
        expect(isControlModeSupported('Collaborative', {})).toBe(false);
        expect(isControlModeSupported('Collaborative', { LiveView: true })).toBe(false);
        expect(isControlModeSupported('Collaborative', { HumanTakeover: true })).toBe(false);
        expect(isControlModeSupported('Collaborative', { LiveView: true, HumanTakeover: true })).toBe(true);
        expect(isControlModeSupported('Collaborative', { LiveView: false, HumanTakeover: true })).toBe(false);
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
                expect(isControlModeSupported(mode, features)).toBe(expected);
            }
        }
    });
});

describe('resolveControlStrategy', () => {
    it("returns 'NativeAI' only when NativeAIControl is set and preferred is not 'ComputerUse'", () => {
        expect(resolveControlStrategy({ NativeAIControl: true })).toBe('NativeAI');
        expect(resolveControlStrategy({ NativeAIControl: true }, 'NativeAI')).toBe('NativeAI');
    });

    it("an explicit 'ComputerUse' preference suppresses native delegation even when supported", () => {
        expect(resolveControlStrategy({ NativeAIControl: true }, 'ComputerUse')).toBe('ComputerUse');
    });

    it("returns 'ComputerUse' when NativeAIControl is absent", () => {
        expect(resolveControlStrategy({})).toBe('ComputerUse');
        expect(resolveControlStrategy({ RawCdpControl: true })).toBe('ComputerUse');
        expect(resolveControlStrategy({ NativeAIControl: false })).toBe('ComputerUse');
    });

    it("preferring 'NativeAI' on a backend without NativeAIControl still falls back to 'ComputerUse'", () => {
        expect(resolveControlStrategy({ RawCdpControl: true }, 'NativeAI')).toBe('ComputerUse');
        expect(resolveControlStrategy({}, 'NativeAI')).toBe('ComputerUse');
    });
});
