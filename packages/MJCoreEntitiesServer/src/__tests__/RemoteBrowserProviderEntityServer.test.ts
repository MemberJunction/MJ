/**
 * Unit tests for the PURE invariant cores behind `MJAIRemoteBrowserProviderEntityServer.ValidateAsync`
 * (the Remote Browser provider registry). Every helper is intra-row (no DB), so these tests exercise
 * them in complete isolation — mirroring the `MJAIBridgeProviderEntityServer` test style.
 */
import { describe, it, expect } from 'vitest';
import { ValidationErrorType } from '@memberjunction/core';
import {
    ValidateRemoteBrowserSupportedFeaturesJson,
    ValidateRemoteBrowserDriverClass,
    ValidateControlModeAgainstFeatures,
    KNOWN_REMOTE_BROWSER_PROVIDER_FEATURE_KEYS,
    REMOTE_BROWSER_CONTROL_MODES,
} from '../custom/MJAIRemoteBrowserProviderEntityServer.server';

// ── DriverClass ─────────────────────────────────────────────────────────────────

describe('ValidateRemoteBrowserDriverClass', () => {
    it('accepts a non-empty driver class', () => {
        expect(ValidateRemoteBrowserDriverClass('BrowserbaseRemoteBrowser')).toBeNull();
    });
    it('ignores null (required-field validator owns it)', () => {
        expect(ValidateRemoteBrowserDriverClass(null)).toBeNull();
        expect(ValidateRemoteBrowserDriverClass(undefined)).toBeNull();
    });
    it('rejects blank / whitespace', () => {
        const err = ValidateRemoteBrowserDriverClass('   ');
        expect(err).not.toBeNull();
        expect(err?.Source).toBe('DriverClass');
        expect(err?.Type).toBe(ValidationErrorType.Failure);
    });
});

// ── SupportedFeatures JSON shape ─────────────────────────────────────────────────

describe('ValidateRemoteBrowserSupportedFeaturesJson', () => {
    it('accepts null / empty (no features)', () => {
        expect(ValidateRemoteBrowserSupportedFeaturesJson(null)).toEqual([]);
        expect(ValidateRemoteBrowserSupportedFeaturesJson('')).toEqual([]);
        expect(ValidateRemoteBrowserSupportedFeaturesJson('   ')).toEqual([]);
    });
    it('accepts a well-formed flags object', () => {
        const raw = JSON.stringify({ RawCdpControl: true, LiveView: true, HumanTakeover: false });
        expect(ValidateRemoteBrowserSupportedFeaturesJson(raw)).toEqual([]);
    });
    it('accepts every known key', () => {
        const obj: Record<string, boolean> = {};
        for (const k of KNOWN_REMOTE_BROWSER_PROVIDER_FEATURE_KEYS) obj[k] = true;
        expect(ValidateRemoteBrowserSupportedFeaturesJson(JSON.stringify(obj))).toEqual([]);
    });
    it('rejects invalid JSON', () => {
        const errs = ValidateRemoteBrowserSupportedFeaturesJson('{not json');
        expect(errs).toHaveLength(1);
        expect(errs[0].Source).toBe('SupportedFeatures');
    });
    it('rejects a JSON array', () => {
        const errs = ValidateRemoteBrowserSupportedFeaturesJson('[true]');
        expect(errs).toHaveLength(1);
        expect(errs[0].Message).toContain('must be a JSON object');
    });
    it('rejects a JSON primitive', () => {
        expect(ValidateRemoteBrowserSupportedFeaturesJson('true')).toHaveLength(1);
        expect(ValidateRemoteBrowserSupportedFeaturesJson('42')).toHaveLength(1);
    });
    it('rejects an unknown feature flag (typo)', () => {
        const errs = ValidateRemoteBrowserSupportedFeaturesJson(JSON.stringify({ RawCdpControl: true, Stelth: true }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Message).toContain("unknown feature flag 'Stelth'");
    });
    it('rejects a non-boolean value', () => {
        const errs = ValidateRemoteBrowserSupportedFeaturesJson(JSON.stringify({ LiveView: 'true' }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Message).toContain("must be a boolean");
    });
    it('reports multiple violations at once', () => {
        const errs = ValidateRemoteBrowserSupportedFeaturesJson(JSON.stringify({ Bogus: true, MultiTab: 1 }));
        expect(errs).toHaveLength(2);
    });
});

// ── DefaultControlMode ↔ features cross-field invariant ──────────────────────────

describe('ValidateControlModeAgainstFeatures', () => {
    it('ignores null / unrecognized mode (sync value-list owns it)', () => {
        expect(ValidateControlModeAgainstFeatures(null, null)).toBeNull();
        expect(ValidateControlModeAgainstFeatures('Bogus', null)).toBeNull();
    });
    it('AgentOnly needs no features', () => {
        expect(ValidateControlModeAgainstFeatures('AgentOnly', null)).toBeNull();
        expect(ValidateControlModeAgainstFeatures('AgentOnly', '{}')).toBeNull();
    });
    it('ViewOnly requires LiveView', () => {
        expect(ValidateControlModeAgainstFeatures('ViewOnly', JSON.stringify({ LiveView: true }))).toBeNull();
        const err = ValidateControlModeAgainstFeatures('ViewOnly', JSON.stringify({ ScreenStreaming: true }));
        expect(err).not.toBeNull();
        expect(err?.Source).toBe('DefaultControlMode');
        expect(err?.Message).toContain("'LiveView'");
    });
    it('Collaborative requires both LiveView and HumanTakeover', () => {
        expect(
            ValidateControlModeAgainstFeatures('Collaborative', JSON.stringify({ LiveView: true, HumanTakeover: true }))
        ).toBeNull();
        const errMissingBoth = ValidateControlModeAgainstFeatures('Collaborative', '{}');
        expect(errMissingBoth).not.toBeNull();
        expect(errMissingBoth?.Message).toContain("'LiveView'");
        expect(errMissingBoth?.Message).toContain("'HumanTakeover'");
    });
    it('Collaborative with LiveView but no HumanTakeover reports only HumanTakeover', () => {
        const err = ValidateControlModeAgainstFeatures('Collaborative', JSON.stringify({ LiveView: true }));
        expect(err).not.toBeNull();
        expect(err?.Message).toContain("'HumanTakeover'");
        expect(err?.Message).not.toContain("'LiveView'");
    });
    it('treats malformed features as no-flags (shape error reported separately) without throwing', () => {
        const err = ValidateControlModeAgainstFeatures('ViewOnly', '{not json');
        expect(err).not.toBeNull(); // LiveView missing
        expect(err?.Source).toBe('DefaultControlMode');
    });
});

// ── Constants sanity ─────────────────────────────────────────────────────────────

describe('Remote Browser provider constants', () => {
    it('has all 12 feature keys', () => {
        expect(KNOWN_REMOTE_BROWSER_PROVIDER_FEATURE_KEYS.size).toBe(12);
    });
    it('has the three control modes', () => {
        expect([...REMOTE_BROWSER_CONTROL_MODES].sort()).toEqual(['AgentOnly', 'Collaborative', 'ViewOnly']);
    });
});
