/**
 * RunViewParams AlternateViewName Tests
 *
 * Tests the AlternateViewName property on RunViewParams:
 * - Included in Equals() comparison for caching correctness
 * - Params differing only by AlternateViewName are not equal
 * - Params with same AlternateViewName are equal
 */

import { describe, it, expect } from 'vitest';
import { RunViewParams } from '../views/runView';

describe('RunViewParams AlternateViewName', () => {
    describe('Equals', () => {
        it('should return true when both have no AlternateViewName', () => {
            const a: RunViewParams = { EntityName: 'Test Entity' };
            const b: RunViewParams = { EntityName: 'Test Entity' };

            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('should return true when both have the same AlternateViewName', () => {
            const a: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwTestAlternate',
            };
            const b: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwTestAlternate',
            };

            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('should return false when AlternateViewName differs', () => {
            const a: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwViewA',
            };
            const b: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwViewB',
            };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should return false when one has AlternateViewName and other does not', () => {
            const a: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwTestAlternate',
            };
            const b: RunViewParams = {
                EntityName: 'Test Entity',
            };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should return false when one has AlternateViewName and other is undefined', () => {
            const a: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwTestAlternate',
            };
            const b: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: undefined,
            };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should still compare other fields correctly alongside AlternateViewName', () => {
            const a: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwSame',
                ExtraFilter: 'Status=1',
                MaxRows: 100,
            };
            const b: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwSame',
                ExtraFilter: 'Status=1',
                MaxRows: 200, // Different MaxRows
            };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should return true when all fields including AlternateViewName match', () => {
            const a: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwSame',
                ExtraFilter: 'Status=1',
                OrderBy: 'Name ASC',
                MaxRows: 100,
                ResultType: 'simple',
            };
            const b: RunViewParams = {
                EntityName: 'Test Entity',
                AlternateViewName: 'vwSame',
                ExtraFilter: 'Status=1',
                OrderBy: 'Name ASC',
                MaxRows: 100,
                ResultType: 'simple',
            };

            expect(RunViewParams.Equals(a, b)).toBe(true);
        });
    });
});
