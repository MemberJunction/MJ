/**
 * Unit tests for the PURE invariant cores behind the five Realtime Bridge `*EntityServer`
 * subclasses' `ValidateAsync` methods. Every helper is intra-row or count-based (no DB), so these
 * tests exercise them in complete isolation — mirroring the `MJAIAgentCoAgentEntityServer` test
 * style.
 */
import { describe, it, expect } from 'vitest';
import { ValidationErrorType } from '@memberjunction/core';
import {
    ValidateSupportedFeaturesJson,
    ValidateDriverClass,
    KNOWN_BRIDGE_PROVIDER_FEATURE_KEYS,
} from '../custom/MJAIBridgeProviderEntityServer.server';
import {
    ValidateIdentityValueFormat,
    BuildDuplicateIdentityError,
} from '../custom/MJAIBridgeAgentIdentityEntityServer.server';
import { BuildDuplicateProviderChannelError } from '../custom/MJAIBridgeProviderChannelEntityServer.server';
import {
    ValidateOutboundHasTarget,
    ValidateStatusTimestamps,
    ValidateCloseReasonCoherence,
} from '../custom/MJAIAgentSessionBridgeEntityServer.server';
import { BuildDuplicateAgentParticipantError } from '../custom/MJAIAgentSessionBridgeParticipantEntityServer.server';

// ── Provider: SupportedFeatures JSON + DriverClass ──────────────────────────────

describe('ValidateDriverClass', () => {
    it('accepts a non-empty driver class', () => {
        expect(ValidateDriverClass('ZoomBridge')).toBeNull();
    });

    it('tolerates null/undefined (sync required-field check owns it)', () => {
        expect(ValidateDriverClass(null)).toBeNull();
        expect(ValidateDriverClass(undefined)).toBeNull();
    });

    it('rejects blank / whitespace-only', () => {
        const err = ValidateDriverClass('   ');
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('DriverClass');
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });
});

describe('ValidateSupportedFeaturesJson', () => {
    it('treats null/empty as valid (no features supported)', () => {
        expect(ValidateSupportedFeaturesJson(null)).toEqual([]);
        expect(ValidateSupportedFeaturesJson('')).toEqual([]);
        expect(ValidateSupportedFeaturesJson('   ')).toEqual([]);
    });

    it('accepts a well-formed flags object', () => {
        const raw = JSON.stringify({ OnDemandJoin: true, AudioIn: true, AudioOut: false, DTMF: true });
        expect(ValidateSupportedFeaturesJson(raw)).toEqual([]);
    });

    it('accepts every known key as a boolean', () => {
        const obj: Record<string, boolean> = {};
        for (const key of KNOWN_BRIDGE_PROVIDER_FEATURE_KEYS) {
            obj[key] = true;
        }
        expect(ValidateSupportedFeaturesJson(JSON.stringify(obj))).toEqual([]);
    });

    it('rejects malformed JSON', () => {
        const errs = ValidateSupportedFeaturesJson('{not json');
        expect(errs).toHaveLength(1);
        expect(errs[0].Source).toBe('SupportedFeatures');
        expect(errs[0].Message).toMatch(/not valid JSON/i);
    });

    it('rejects a non-object (array / primitive)', () => {
        expect(ValidateSupportedFeaturesJson('[]')[0].Message).toMatch(/must be a JSON object/i);
        expect(ValidateSupportedFeaturesJson('true')[0].Message).toMatch(/must be a JSON object/i);
        expect(ValidateSupportedFeaturesJson('42')[0].Message).toMatch(/must be a JSON object/i);
        expect(ValidateSupportedFeaturesJson('null')[0].Message).toMatch(/must be a JSON object/i);
    });

    it('rejects an unknown feature flag (naming it)', () => {
        const errs = ValidateSupportedFeaturesJson(JSON.stringify({ OutbondDial: true }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Message).toContain('OutbondDial');
        expect(errs[0].Message).toMatch(/unknown feature flag/i);
    });

    it('rejects a non-boolean value for a known flag (naming it)', () => {
        const errs = ValidateSupportedFeaturesJson(JSON.stringify({ AudioIn: 'true' }));
        expect(errs).toHaveLength(1);
        expect(errs[0].Message).toContain('AudioIn');
        expect(errs[0].Message).toMatch(/must be a boolean/i);
    });

    it('reports BOTH an unknown key and a bad-typed known key', () => {
        const errs = ValidateSupportedFeaturesJson(JSON.stringify({ Bogus: true, DTMF: 1 }));
        expect(errs).toHaveLength(2);
    });
});

// ── Identity: format + uniqueness ───────────────────────────────────────────────

describe('ValidateIdentityValueFormat', () => {
    it('accepts a valid email for IdentityType Email', () => {
        expect(ValidateIdentityValueFormat('Email', 'sage@customer.com')).toBeNull();
    });

    it('rejects a non-email for Email', () => {
        const err = ValidateIdentityValueFormat('Email', 'not-an-email');
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('IdentityValue');
        expect(err!.Message).toMatch(/email/i);
    });

    it('accepts E.164-ish phone numbers (with separators) for PhoneNumber', () => {
        expect(ValidateIdentityValueFormat('PhoneNumber', '+15551234567')).toBeNull();
        expect(ValidateIdentityValueFormat('PhoneNumber', '+1 (555) 123-4567')).toBeNull();
        expect(ValidateIdentityValueFormat('PhoneNumber', '5551234567')).toBeNull();
    });

    it('rejects a too-short / non-numeric phone for PhoneNumber', () => {
        expect(ValidateIdentityValueFormat('PhoneNumber', '12345')).not.toBeNull();
        expect(ValidateIdentityValueFormat('PhoneNumber', 'CALL-ME')).not.toBeNull();
    });

    it('treats AccountID as opaque (no shape enforced)', () => {
        expect(ValidateIdentityValueFormat('AccountID', 'anything-goes-here')).toBeNull();
    });

    it('tolerates missing type/value (sync required-field check owns it)', () => {
        expect(ValidateIdentityValueFormat(null, 'x')).toBeNull();
        expect(ValidateIdentityValueFormat('Email', null)).toBeNull();
        expect(ValidateIdentityValueFormat('Email', '   ')).toBeNull();
    });
});

describe('BuildDuplicateIdentityError', () => {
    it('allows a unique identity (no other rows)', () => {
        expect(BuildDuplicateIdentityError('prov-1', 'sage@x.com', 0)).toBeNull();
        expect(BuildDuplicateIdentityError('prov-1', 'sage@x.com', -1)).toBeNull();
    });

    it('rejects a duplicate (provider, value), naming the value', () => {
        const err = BuildDuplicateIdentityError('prov-1', 'sage@x.com', 1);
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('IdentityValue');
        expect(err!.Message).toContain('sage@x.com');
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });
});

// ── Provider Channel: uniqueness (friendly-message over DB UNIQUE) ───────────────

describe('BuildDuplicateProviderChannelError', () => {
    it('allows a unique (provider, channel) pairing', () => {
        expect(BuildDuplicateProviderChannelError('prov-1', 'chan-1', 0)).toBeNull();
    });

    it('rejects a duplicate pairing', () => {
        const err = BuildDuplicateProviderChannelError('prov-1', 'chan-1', 2);
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('ChannelID');
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });
});

// ── Session Bridge: cross-field coherence ────────────────────────────────────────

describe('ValidateOutboundHasTarget', () => {
    it('requires an Address or ExternalConnectionID for Outbound', () => {
        const err = ValidateOutboundHasTarget('Outbound', null, null);
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('Address');
    });

    it('accepts Outbound with an Address', () => {
        expect(ValidateOutboundHasTarget('Outbound', 'https://zoom.us/j/123', null)).toBeNull();
    });

    it('accepts Outbound with an ExternalConnectionID', () => {
        expect(ValidateOutboundHasTarget('Outbound', null, 'call-SID-abc')).toBeNull();
    });

    it('treats blank/whitespace targets as missing', () => {
        expect(ValidateOutboundHasTarget('Outbound', '   ', '  ')).not.toBeNull();
    });

    it('exempts Inbound bridges (endpoint comes to the agent)', () => {
        expect(ValidateOutboundHasTarget('Inbound', null, null)).toBeNull();
    });
});

describe('ValidateStatusTimestamps', () => {
    it('requires ConnectedAt when Connected', () => {
        const errs = ValidateStatusTimestamps('Connected', null, null);
        expect(errs).toHaveLength(1);
        expect(errs[0].Source).toBe('ConnectedAt');
    });

    it('accepts Connected with a ConnectedAt', () => {
        expect(ValidateStatusTimestamps('Connected', new Date(), null)).toEqual([]);
    });

    it('requires DisconnectedAt when terminal (Disconnected / Failed)', () => {
        expect(ValidateStatusTimestamps('Disconnected', null, null).some((e) => e.Source === 'DisconnectedAt')).toBe(true);
        expect(ValidateStatusTimestamps('Failed', null, null).some((e) => e.Source === 'DisconnectedAt')).toBe(true);
    });

    it('accepts terminal with a DisconnectedAt', () => {
        expect(ValidateStatusTimestamps('Disconnected', null, new Date())).toEqual([]);
    });

    it('imposes no timestamp requirement on intermediate states', () => {
        expect(ValidateStatusTimestamps('Pending', null, null)).toEqual([]);
        expect(ValidateStatusTimestamps('Connecting', null, null)).toEqual([]);
        expect(ValidateStatusTimestamps('Disconnecting', null, null)).toEqual([]);
    });
});

describe('ValidateCloseReasonCoherence', () => {
    it('rejects a CloseReason on a non-terminal bridge (as a Failure)', () => {
        const err = ValidateCloseReasonCoherence('Connected', 'Explicit');
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('CloseReason');
        expect(err!.Type).toBe(ValidationErrorType.Failure);
    });

    it('warns (not fails) when a terminal bridge has no CloseReason', () => {
        const err = ValidateCloseReasonCoherence('Failed', null);
        expect(err).not.toBeNull();
        expect(err!.Type).toBe(ValidationErrorType.Warning);
    });

    it('accepts a terminal bridge with a CloseReason', () => {
        expect(ValidateCloseReasonCoherence('Disconnected', 'HostEnded')).toBeNull();
    });

    it('accepts a non-terminal bridge with no CloseReason', () => {
        expect(ValidateCloseReasonCoherence('Connecting', null)).toBeNull();
    });
});

// ── Participant: one agent per bridge ────────────────────────────────────────────

describe('BuildDuplicateAgentParticipantError', () => {
    it('allows the first agent participant on a bridge', () => {
        expect(BuildDuplicateAgentParticipantError('bridge-1', 0)).toBeNull();
        expect(BuildDuplicateAgentParticipantError('bridge-1', -1)).toBeNull();
    });

    it('rejects a second agent participant on the same bridge', () => {
        const err = BuildDuplicateAgentParticipantError('bridge-1', 1);
        expect(err).not.toBeNull();
        expect(err!.Source).toBe('IsAgent');
        expect(err!.Type).toBe(ValidationErrorType.Failure);
        expect(err!.Message).toMatch(/already has an agent/i);
    });
});
