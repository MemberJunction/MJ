import { describe, it, expect } from 'vitest';
import { RemoteBrowserCapabilityNotSupportedError } from '../capability-errors';

describe('RemoteBrowserCapabilityNotSupportedError', () => {
    it('carries the feature name and provider name', () => {
        const err = new RemoteBrowserCapabilityNotSupportedError('LiveView', 'Browserbase');
        expect(err.FeatureName).toBe('LiveView');
        expect(err.ProviderName).toBe('Browserbase');
    });

    it('builds a default message mentioning both names', () => {
        const err = new RemoteBrowserCapabilityNotSupportedError('HumanTakeover', 'Steel');
        expect(err.message).toContain('HumanTakeover');
        expect(err.message).toContain('Steel');
    });

    it('honors a custom message override', () => {
        const err = new RemoteBrowserCapabilityNotSupportedError('NativeAIControl', 'Hyperbrowser', 'custom message');
        expect(err.message).toBe('custom message');
        // names still captured even with custom message
        expect(err.FeatureName).toBe('NativeAIControl');
        expect(err.ProviderName).toBe('Hyperbrowser');
    });

    it('is an instanceof Error and of itself', () => {
        const err = new RemoteBrowserCapabilityNotSupportedError('LiveView', 'Browserbase');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(RemoteBrowserCapabilityNotSupportedError);
    });

    it('has the correct name property', () => {
        const err = new RemoteBrowserCapabilityNotSupportedError('LiveView', 'Browserbase');
        expect(err.name).toBe('RemoteBrowserCapabilityNotSupportedError');
    });

    it('is catchable as its specific subtype', () => {
        try {
            throw new RemoteBrowserCapabilityNotSupportedError('ScreenStreaming', 'Browserless');
        } catch (e) {
            expect(e instanceof RemoteBrowserCapabilityNotSupportedError).toBe(true);
            if (e instanceof RemoteBrowserCapabilityNotSupportedError) {
                expect(e.FeatureName).toBe('ScreenStreaming');
            }
        }
    });
});
