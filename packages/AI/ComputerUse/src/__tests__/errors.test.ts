import { describe, it, expect } from 'vitest';
import { ComputerUseError } from '../types/errors.js';
import type { ErrorCategory } from '../types/errors.js';

describe('ComputerUseError', () => {
    describe('constructor', () => {
        it('should set Category and Message', () => {
            const err = new ComputerUseError('BrowserCrash', 'Process terminated unexpectedly');
            expect(err.Category).toBe('BrowserCrash');
            expect(err.Message).toBe('Process terminated unexpectedly');
        });

        it('should set OriginalError when provided', () => {
            const original = new Error('underlying cause');
            const err = new ComputerUseError('LLMError', 'LLM call failed', original);
            expect(err.OriginalError).toBe(original);
            expect(err.OriginalError!.message).toBe('underlying cause');
        });

        it('should leave OriginalError undefined when not provided', () => {
            const err = new ComputerUseError('Cancelled', 'User cancelled');
            expect(err.OriginalError).toBeUndefined();
        });

        it('should leave StepNumber undefined by default', () => {
            const err = new ComputerUseError('ElementNotFound', 'button missing');
            expect(err.StepNumber).toBeUndefined();
        });
    });

    describe('StepNumber', () => {
        it('should be settable after construction', () => {
            const err = new ComputerUseError('NavigationTimeout', 'timed out');
            err.StepNumber = 5;
            expect(err.StepNumber).toBe(5);
        });
    });

    describe('ErrorCategory discrimination', () => {
        const categories: ErrorCategory[] = [
            'BrowserCrash',
            'NavigationTimeout',
            'ElementNotFound',
            'LLMError',
            'LLMParseError',
            'ToolExecutionError',
            'AuthenticationError',
            'DomainBlocked',
            'Cancelled',
        ];

        it.each(categories)('should accept "%s" as a valid ErrorCategory', (category) => {
            const err = new ComputerUseError(category, `Error of type ${category}`);
            expect(err.Category).toBe(category);
            expect(err.Message).toBe(`Error of type ${category}`);
        });
    });

    describe('preserves original error stack trace', () => {
        it('should preserve the stack from the original Error', () => {
            const original = new Error('root cause');
            const err = new ComputerUseError('BrowserCrash', 'wrapped', original);
            expect(err.OriginalError!.stack).toBeDefined();
            expect(err.OriginalError!.stack).toContain('root cause');
        });
    });
});
