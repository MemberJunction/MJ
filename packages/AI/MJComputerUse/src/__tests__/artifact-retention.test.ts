import { describe, it, expect } from 'vitest';
import { shouldCaptureArtifact, shouldRetainArtifact } from '../test-driver/artifact-retention.js';

describe('shouldCaptureArtifact (CU-F4)', () => {
    it('captures for retain-on-failure and on', () => {
        expect(shouldCaptureArtifact('retain-on-failure')).toBe(true);
        expect(shouldCaptureArtifact('on')).toBe(true);
    });

    it('does not capture for off (zero overhead)', () => {
        expect(shouldCaptureArtifact('off')).toBe(false);
    });
});

describe('shouldRetainArtifact (CU-F4)', () => {
    it('on: keeps regardless of outcome', () => {
        expect(shouldRetainArtifact('on', true)).toBe(true);
        expect(shouldRetainArtifact('on', false)).toBe(true);
    });

    it('retain-on-failure: keeps only when the test failed', () => {
        expect(shouldRetainArtifact('retain-on-failure', false)).toBe(true);
        expect(shouldRetainArtifact('retain-on-failure', true)).toBe(false);
    });

    it('off: never keeps', () => {
        expect(shouldRetainArtifact('off', true)).toBe(false);
        expect(shouldRetainArtifact('off', false)).toBe(false);
    });
});
