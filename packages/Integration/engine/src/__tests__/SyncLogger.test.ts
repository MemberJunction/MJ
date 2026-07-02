import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncLogger } from '../SyncLogger.js';
import type { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';

/**
 * Covers the structured WARNING channel added for the second-layer silent-empty surfacing:
 * SyncLogger.warning() must (1) forward to the durable emitter's warning(stage, code, message, data)
 * with the exact arguments, (2) route to console.warn (greppable) and NEVER console.error (a warning
 * must never read as a run failure), and (3) never throw when no emitter is attached.
 */
describe('SyncLogger.warning (structured warning channel)', () => {
    let warnSpy: ReturnType<typeof vi.fn>;
    let consoleWarn: ReturnType<typeof vi.spyOn>;
    let logger: SyncLogger;
    let emitter: IntegrationProgressEmitter;

    beforeEach(() => {
        warnSpy = vi.fn();
        consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        // Minimal emitter stub — warning() only triggers the 'sync.warning' forward, which calls
        // emitter.warning(). (Test-only mock cast.)
        emitter = { warning: warnSpy } as unknown as IntegrationProgressEmitter;
        logger = new SyncLogger({ ciId: 'ci-1', integration: 'HubSpot' });
    });

    afterEach(() => {
        consoleWarn.mockRestore();
        vi.restoreAllMocks();
    });

    it('forwards warning() to emitter.warning(stage, code, message, data) with exact args', () => {
        logger.attachEmitter(emitter);
        logger.warning('assoc_contacts_companies', 'ZERO_PARENTS', 'no parents', { parentType: 'contacts' });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            'assoc_contacts_companies', 'ZERO_PARENTS', 'no parents', { parentType: 'contacts' }
        );
    });

    it('passes undefined data through when omitted', () => {
        logger.attachEmitter(emitter);
        logger.warning('s', 'C', 'm');
        expect(warnSpy).toHaveBeenCalledWith('s', 'C', 'm', undefined);
    });

    it('routes warnings to console.warn and never console.error', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        logger.warning('s', 'SECOND_LAYER_EMPTY', 'flagged');
        expect(consoleWarn).toHaveBeenCalledTimes(1);
        expect(consoleError).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it('does not throw and still logs when no emitter is attached', () => {
        expect(() => logger.warning('s', 'C', 'm')).not.toThrow();
        expect(consoleWarn).toHaveBeenCalledTimes(1);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
