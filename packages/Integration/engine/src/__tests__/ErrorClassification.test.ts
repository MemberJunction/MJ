import { describe, it, expect } from 'vitest';
import { ClassifyError, IsRetryableError } from '../types.js';
import type { SyncErrorCode } from '../types.js';

describe('IsRetryableError', () => {
    it('should return true for NETWORK_TIMEOUT', () => {
        expect(IsRetryableError('NETWORK_TIMEOUT')).toBe(true);
    });

    it('should return true for RATE_LIMIT_EXCEEDED', () => {
        expect(IsRetryableError('RATE_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should return true for DATABASE_ERROR', () => {
        expect(IsRetryableError('DATABASE_ERROR')).toBe(true);
    });

    it('should return false for VALIDATION_ERROR', () => {
        expect(IsRetryableError('VALIDATION_ERROR')).toBe(false);
    });

    it('should return false for FK_CONSTRAINT_VIOLATION', () => {
        expect(IsRetryableError('FK_CONSTRAINT_VIOLATION')).toBe(false);
    });

    it('should return false for DUPLICATE_KEY', () => {
        expect(IsRetryableError('DUPLICATE_KEY')).toBe(false);
    });

    it('should return false for CONNECTOR_ERROR', () => {
        expect(IsRetryableError('CONNECTOR_ERROR')).toBe(false);
    });

    it('should return false for TRANSFORM_ERROR', () => {
        expect(IsRetryableError('TRANSFORM_ERROR')).toBe(false);
    });

    it('should return false for MATCH_RESOLUTION_ERROR', () => {
        expect(IsRetryableError('MATCH_RESOLUTION_ERROR')).toBe(false);
    });

    it('should return false for WATERMARK_INVALID', () => {
        expect(IsRetryableError('WATERMARK_INVALID')).toBe(false);
    });

    it('should return false for CONFIGURATION_ERROR', () => {
        expect(IsRetryableError('CONFIGURATION_ERROR')).toBe(false);
    });

    it('should return false for UNKNOWN_ERROR', () => {
        expect(IsRetryableError('UNKNOWN_ERROR')).toBe(false);
    });
});

describe('ClassifyError', () => {
    describe('NETWORK_TIMEOUT detection', () => {
        it('should classify "timeout" messages as NETWORK_TIMEOUT with Warning severity', () => {
            const result = ClassifyError(new Error('Connection timeout after 30s'));
            expect(result.Code).toBe('NETWORK_TIMEOUT');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "timed out" messages as NETWORK_TIMEOUT', () => {
            const result = ClassifyError(new Error('Request timed out'));
            expect(result.Code).toBe('NETWORK_TIMEOUT');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify ECONNRESET messages as NETWORK_TIMEOUT', () => {
            const result = ClassifyError(new Error('read ECONNRESET'));
            expect(result.Code).toBe('NETWORK_TIMEOUT');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('RATE_LIMIT_EXCEEDED detection', () => {
        it('should classify "rate limit" messages as RATE_LIMIT_EXCEEDED', () => {
            const result = ClassifyError(new Error('Rate limit exceeded, retry after 60s'));
            expect(result.Code).toBe('RATE_LIMIT_EXCEEDED');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "throttled" messages as RATE_LIMIT_EXCEEDED', () => {
            const result = ClassifyError(new Error('Request throttled by server'));
            expect(result.Code).toBe('RATE_LIMIT_EXCEEDED');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "429" messages as RATE_LIMIT_EXCEEDED', () => {
            const result = ClassifyError(new Error('HTTP 429 Too Many Requests'));
            expect(result.Code).toBe('RATE_LIMIT_EXCEEDED');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('FK_CONSTRAINT_VIOLATION detection', () => {
        it('should classify "foreign key" messages as FK_CONSTRAINT_VIOLATION', () => {
            const result = ClassifyError(new Error('Foreign key constraint violation'));
            expect(result.Code).toBe('FK_CONSTRAINT_VIOLATION');
            expect(result.Severity).toBe('Critical');
        });

        it('should classify "FK_" messages as FK_CONSTRAINT_VIOLATION', () => {
            const result = ClassifyError(new Error('Constraint FK_Contact_Account violated'));
            expect(result.Code).toBe('FK_CONSTRAINT_VIOLATION');
            expect(result.Severity).toBe('Critical');
        });

        it('should classify "reference constraint" messages as FK_CONSTRAINT_VIOLATION', () => {
            const result = ClassifyError(new Error('Reference constraint failed'));
            expect(result.Code).toBe('FK_CONSTRAINT_VIOLATION');
            expect(result.Severity).toBe('Critical');
        });
    });

    describe('DUPLICATE_KEY detection', () => {
        it('should classify "duplicate" messages as DUPLICATE_KEY', () => {
            const result = ClassifyError(new Error('Duplicate entry for key "PRIMARY"'));
            expect(result.Code).toBe('DUPLICATE_KEY');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "unique constraint" messages as DUPLICATE_KEY', () => {
            const result = ClassifyError(new Error('Unique constraint violation on Email'));
            expect(result.Code).toBe('DUPLICATE_KEY');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "primary key" messages as DUPLICATE_KEY', () => {
            const result = ClassifyError(new Error('Violation of PRIMARY KEY constraint'));
            expect(result.Code).toBe('DUPLICATE_KEY');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('VALIDATION_ERROR detection', () => {
        it('should classify "validation" messages as VALIDATION_ERROR', () => {
            const result = ClassifyError(new Error('Validation failed for field Email'));
            expect(result.Code).toBe('VALIDATION_ERROR');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "validate" messages as VALIDATION_ERROR', () => {
            const result = ClassifyError(new Error('Failed to validate record'));
            expect(result.Code).toBe('VALIDATION_ERROR');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('TRANSFORM_ERROR detection', () => {
        it('should classify "transform" messages as TRANSFORM_ERROR', () => {
            const result = ClassifyError(new Error('Transform pipeline failed'));
            expect(result.Code).toBe('TRANSFORM_ERROR');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "mapping" messages as TRANSFORM_ERROR', () => {
            const result = ClassifyError(new Error('Field mapping error'));
            expect(result.Code).toBe('TRANSFORM_ERROR');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('MATCH_RESOLUTION_ERROR detection', () => {
        it('should classify "match" messages as MATCH_RESOLUTION_ERROR', () => {
            const result = ClassifyError(new Error('No match found for record'));
            expect(result.Code).toBe('MATCH_RESOLUTION_ERROR');
            expect(result.Severity).toBe('Warning');
        });

        it('should classify "resolve" messages as MATCH_RESOLUTION_ERROR', () => {
            const result = ClassifyError(new Error('Cannot resolve ambiguous record'));
            expect(result.Code).toBe('MATCH_RESOLUTION_ERROR');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('WATERMARK_INVALID detection', () => {
        it('should classify "watermark" messages as WATERMARK_INVALID', () => {
            const result = ClassifyError(new Error('Invalid watermark value'));
            expect(result.Code).toBe('WATERMARK_INVALID');
            expect(result.Severity).toBe('Warning');
        });
    });

    describe('CONFIGURATION_ERROR detection', () => {
        it('should classify "configuration" messages as CONFIGURATION_ERROR', () => {
            const result = ClassifyError(new Error('Invalid configuration for integration'));
            expect(result.Code).toBe('CONFIGURATION_ERROR');
            expect(result.Severity).toBe('Critical');
        });

        it('should classify "config" messages as CONFIGURATION_ERROR', () => {
            const result = ClassifyError(new Error('Bad config key: apiUrl'));
            expect(result.Code).toBe('CONFIGURATION_ERROR');
            expect(result.Severity).toBe('Critical');
        });
    });

    describe('DATABASE_ERROR detection', () => {
        it('should classify "connect" messages as DATABASE_ERROR', () => {
            const result = ClassifyError(new Error('Failed to connect to database'));
            expect(result.Code).toBe('DATABASE_ERROR');
            expect(result.Severity).toBe('Critical');
        });

        it('should classify "ECONNREFUSED" messages as DATABASE_ERROR', () => {
            const result = ClassifyError(new Error('ECONNREFUSED 127.0.0.1:1433'));
            expect(result.Code).toBe('DATABASE_ERROR');
            expect(result.Severity).toBe('Critical');
        });

        it('should classify "sql" messages as DATABASE_ERROR', () => {
            const result = ClassifyError(new Error('SQL Server error 50000'));
            expect(result.Code).toBe('DATABASE_ERROR');
            expect(result.Severity).toBe('Critical');
        });
    });

    describe('CONNECTOR_ERROR detection', () => {
        it('should classify messages containing "connector" as DATABASE_ERROR due to priority ordering', () => {
            // Note: "connector" contains the substring "connect", which matches
            // DATABASE_ERROR before CONNECTOR_ERROR in the priority chain.
            // This documents the current behavior; CONNECTOR_ERROR requires a
            // code path that doesn't contain other higher-priority keywords.
            const result = ClassifyError(new Error('The HubSpot connector returned invalid data'));
            expect(result.Code).toBe('DATABASE_ERROR');
            expect(result.Severity).toBe('Critical');
        });
    });

    describe('UNKNOWN_ERROR fallback', () => {
        it('should classify unrecognized messages as UNKNOWN_ERROR', () => {
            const result = ClassifyError(new Error('Something completely unexpected happened'));
            expect(result.Code).toBe('UNKNOWN_ERROR');
            expect(result.Severity).toBe('Critical');
        });

        it('should handle non-Error values (string)', () => {
            const result = ClassifyError('plain string error');
            expect(result.Code).toBe('UNKNOWN_ERROR');
            expect(result.Severity).toBe('Critical');
        });

        it('should handle non-Error values (number)', () => {
            const result = ClassifyError(42);
            expect(result.Code).toBe('UNKNOWN_ERROR');
            expect(result.Severity).toBe('Critical');
        });

        it('should handle null/undefined gracefully', () => {
            const result = ClassifyError(null);
            expect(result.Code).toBe('UNKNOWN_ERROR');
            expect(result.Severity).toBe('Critical');
        });
    });

    describe('case insensitivity', () => {
        it('should match regardless of case', () => {
            const result = ClassifyError(new Error('TIMEOUT ERROR'));
            expect(result.Code).toBe('NETWORK_TIMEOUT');
        });

        it('should match mixed case "Rate Limit"', () => {
            const result = ClassifyError(new Error('Rate Limit Exceeded'));
            expect(result.Code).toBe('RATE_LIMIT_EXCEEDED');
        });
    });

    describe('priority ordering', () => {
        it('should classify "timeout" before "connect" when both match', () => {
            // "Connection timeout" contains both "timeout" and "connect" but timeout takes priority
            const result = ClassifyError(new Error('Connection timeout'));
            expect(result.Code).toBe('NETWORK_TIMEOUT');
        });
    });

    describe('IsRetryableError integration with ClassifyError', () => {
        it('should identify network timeout errors as retryable', () => {
            const classified = ClassifyError(new Error('Request timed out'));
            expect(IsRetryableError(classified.Code)).toBe(true);
        });

        it('should identify rate limit errors as retryable', () => {
            const classified = ClassifyError(new Error('Rate limit exceeded'));
            expect(IsRetryableError(classified.Code)).toBe(true);
        });

        it('should identify database errors as retryable', () => {
            const classified = ClassifyError(new Error('SQL Server connection lost'));
            expect(IsRetryableError(classified.Code)).toBe(true);
        });

        it('should identify validation errors as non-retryable', () => {
            const classified = ClassifyError(new Error('Validation failed'));
            expect(IsRetryableError(classified.Code)).toBe(false);
        });

        it('should identify FK constraint errors as non-retryable', () => {
            const classified = ClassifyError(new Error('Foreign key constraint violated'));
            expect(IsRetryableError(classified.Code)).toBe(false);
        });
    });
});
