import { describe, it, expect } from 'vitest';
import { classifyError } from '../check-manifest-loadability.mjs';

/**
 * The manifest gate cannot currently reach a green state on `next` (83 packages
 * emit extensionless relative specifiers into dist, which Node's native ESM
 * resolver rejects — a build-config problem, not an export problem). These tests
 * are therefore the evidence that the gate WOULD correctly identify a real
 * missing-export failure, and that it distinguishes that from the unrelated
 * blockers that can mask it.
 */
describe('classifyError', () => {
    it('identifies a missing export — the bug this gate exists to catch', () => {
        const stderr =
            "SyntaxError: The requested module '@memberjunction/ng-conversations' " +
            "does not provide an export named 'AgentMentionProvider'";
        expect(classifyError(stderr)).toBe('MISSING_EXPORT');
    });

    it('identifies the Angular JIT blocker', () => {
        const stderr =
            "Error: The injectable 'PlatformLocation' needs to be compiled using the JIT compiler, " +
            "but '@angular/compiler' is not available.";
        expect(classifyError(stderr)).toBe('ANGULAR_JIT');
    });

    it('identifies the extensionless-specifier blocker', () => {
        const stderr =
            "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/repo/packages/x/dist/lib/thing' " +
            'imported from /repo/packages/x/dist/public-api.js';
        expect(classifyError(stderr)).toBe('EXTENSIONLESS_SPECIFIER');
    });

    it('identifies a DOM-global blocker (a decision point, not an auto-fix)', () => {
        expect(classifyError('ReferenceError: document is not defined')).toBe('DOM_GLOBAL');
    });

    it('prefers the missing-export classification over a co-occurring resolver error', () => {
        // Ordering matters: if both signatures appear, the export problem is the
        // actionable one for this gate, and must not be masked.
        const stderr = [
            "SyntaxError: The requested module '@memberjunction/x' does not provide an export named 'Y'",
            "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/repo/z'",
        ].join('\n');
        expect(classifyError(stderr)).toBe('MISSING_EXPORT');
    });

    it('falls back to OTHER for an unrecognized failure', () => {
        expect(classifyError('Segmentation fault')).toBe('OTHER');
    });
});
