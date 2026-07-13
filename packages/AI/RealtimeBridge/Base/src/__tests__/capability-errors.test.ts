import { describe, it, expect } from 'vitest';
import { BridgeCapabilityNotSupportedError } from '../capability-errors';

describe('BridgeCapabilityNotSupportedError', () => {
    it('carries the feature name and provider name', () => {
        const err = new BridgeCapabilityNotSupportedError('DTMF', 'Zoom');
        expect(err.FeatureName).toBe('DTMF');
        expect(err.ProviderName).toBe('Zoom');
    });

    it('builds a default message mentioning both names', () => {
        const err = new BridgeCapabilityNotSupportedError('CallTransfer', 'Twilio');
        expect(err.message).toContain('CallTransfer');
        expect(err.message).toContain('Twilio');
    });

    it('honors a custom message override', () => {
        const err = new BridgeCapabilityNotSupportedError('Recording', 'Teams', 'custom message');
        expect(err.message).toBe('custom message');
        // names still captured even with custom message
        expect(err.FeatureName).toBe('Recording');
        expect(err.ProviderName).toBe('Teams');
    });

    it('is an instanceof Error and of itself', () => {
        const err = new BridgeCapabilityNotSupportedError('DTMF', 'Zoom');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('has the correct name property', () => {
        const err = new BridgeCapabilityNotSupportedError('DTMF', 'Zoom');
        expect(err.name).toBe('BridgeCapabilityNotSupportedError');
    });

    it('is catchable as its specific subtype', () => {
        try {
            throw new BridgeCapabilityNotSupportedError('Recording', 'Webex');
        } catch (e) {
            expect(e instanceof BridgeCapabilityNotSupportedError).toBe(true);
            if (e instanceof BridgeCapabilityNotSupportedError) {
                expect(e.FeatureName).toBe('Recording');
            }
        }
    });
});
