/**
 * Unit tests for UsageLogger
 * Tests serialization/deserialization of evaluated rules and log entry creation.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        async GetEntityObject() {
            return {
                NewRecord: vi.fn(),
                Save: vi.fn().mockResolvedValue(true),
                ID: 'log-id-1',
                APIKeyID: null,
                ApplicationID: null,
                Endpoint: null,
                Operation: null,
                Method: null,
                StatusCode: null,
                ResponseTimeMs: null,
                IPAddress: null,
                UserAgent: null,
                RequestedResource: null,
                ScopesEvaluated: null,
                AuthorizationResult: null,
                DeniedReason: null,
            };
        }
    },
    UserInfo: class { ID = 'mock-user'; },
}));

vi.mock('@memberjunction/core-entities', () => ({
    APIKeyUsageLogEntity: class {},
}));

import { UsageLogger } from '../UsageLogger';
import type { EvaluatedRule } from '../interfaces';

describe('UsageLogger', () => {
    describe('ParseEvaluatedRules (static)', () => {
        it('should return empty array for null input', () => {
            expect(UsageLogger.ParseEvaluatedRules(null)).toEqual([]);
        });

        it('should return empty array for empty string', () => {
            expect(UsageLogger.ParseEvaluatedRules('')).toEqual([]);
        });

        it('should return empty array for invalid JSON', () => {
            expect(UsageLogger.ParseEvaluatedRules('not-json')).toEqual([]);
        });

        it('should parse serialized rules', () => {
            const serialized = JSON.stringify([{
                level: 'application',
                ruleId: 'rule-1',
                scopePath: 'view:run',
                pattern: '*',
                patternType: 'Include',
                isDeny: false,
                priority: 100,
                matched: true,
                patternMatched: '*',
                result: 'Allowed'
            }]);

            const result = UsageLogger.ParseEvaluatedRules(serialized);
            expect(result).toHaveLength(1);
            expect(result[0].Level).toBe('application');
            expect(result[0].Rule.Id).toBe('rule-1');
            expect(result[0].Rule.ScopePath).toBe('view:run');
            expect(result[0].Rule.Pattern).toBe('*');
            expect(result[0].Rule.PatternType).toBe('Include');
            expect(result[0].Rule.IsDeny).toBe(false);
            expect(result[0].Rule.Priority).toBe(100);
            expect(result[0].Matched).toBe(true);
            expect(result[0].PatternMatched).toBe('*');
            expect(result[0].Result).toBe('Allowed');
        });

        it('should parse multiple rules', () => {
            const serialized = JSON.stringify([
                {
                    level: 'application',
                    ruleId: 'rule-1',
                    scopePath: 'view:run',
                    pattern: '*',
                    patternType: 'Include',
                    isDeny: false,
                    priority: 100,
                    matched: true,
                    patternMatched: '*',
                    result: 'Allowed'
                },
                {
                    level: 'key',
                    ruleId: 'rule-2',
                    scopePath: 'view:run',
                    pattern: 'Users',
                    patternType: 'Include',
                    isDeny: false,
                    priority: 50,
                    matched: true,
                    patternMatched: 'Users',
                    result: 'Allowed'
                }
            ]);

            const result = UsageLogger.ParseEvaluatedRules(serialized);
            expect(result).toHaveLength(2);
            expect(result[0].Level).toBe('application');
            expect(result[1].Level).toBe('key');
        });

        it('should handle denied rules', () => {
            const serialized = JSON.stringify([{
                level: 'key',
                ruleId: 'rule-deny',
                scopePath: 'agent:execute',
                pattern: 'RestrictedAgent',
                patternType: 'Include',
                isDeny: true,
                priority: 200,
                matched: true,
                patternMatched: 'RestrictedAgent',
                result: 'Denied'
            }]);

            const result = UsageLogger.ParseEvaluatedRules(serialized);
            expect(result[0].Rule.IsDeny).toBe(true);
            expect(result[0].Result).toBe('Denied');
        });
    });
});
