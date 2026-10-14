import { describe, it, expect, afterEach, vi } from 'vitest';
import { LogErrorEx } from '../generic/logging';

/**
 * `LogErrorEx` serializes its metadata into the message. Metadata that cannot be serialized as JSON (a circular
 * reference, a BigInt) must never make the logger throw: the caller is usually in a catch block, and a TypeError
 * from the logger would replace the error being reported.
 */
/** An error classification that points back at its error, as an error carrying its own classification does. */
interface Classification {
    errorType: string;
    error?: ClassifiedError;
}
interface ClassifiedError extends Error {
    errorInfo?: Classification;
}

describe('LogErrorEx metadata serialization', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs the error when its metadata holds a circular reference, marking the cycle', () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const info: Classification = { errorType: 'VendorValidationError' };
        const error: ClassifiedError = new Error('refused: seed 42 would not be sent');
        error.errorInfo = info;
        info.error = error;

        expect(() => LogErrorEx({ message: 'Model execution failed', error, metadata: { errorInfo: info } })).not.toThrow();
        const message = String(logged.mock.calls[0][0]);
        expect(message).toContain('refused: seed 42 would not be sent');
        expect(message).toContain('"errorType": "VendorValidationError"');
        expect(message).toContain('[Circular]');
    });

    it('logs the error when its metadata cannot be serialized at all', () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => LogErrorEx({ message: 'Count failed', error: new Error('overflow'), metadata: { count: BigInt(1) } })).not.toThrow();
        const message = String(logged.mock.calls[0][0]);
        expect(message).toContain('overflow');
        expect(message).toContain('Metadata: [not serializable:');
    });

    it('still serializes a repeated, non-circular reference in full', () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const shared = { id: 'm-1' };

        LogErrorEx({ message: 'Two models', metadata: { first: shared, second: shared } });
        const message = String(logged.mock.calls[0][0]);
        expect(message).not.toContain('[Circular]');
        expect(message.match(/"id": "m-1"/g)).toHaveLength(2);
    });
});
