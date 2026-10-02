import { describe, it, expect } from 'vitest';
import {
    ParseAssignmentStrategy,
    MergeAssignmentStrategies,
    AgentRequestAssignmentStrategy,
} from '../assignment-strategy';

describe('parseAssignmentStrategy', () => {
    it('should return null for null input', () => {
        expect(ParseAssignmentStrategy(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
        expect(ParseAssignmentStrategy(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
        expect(ParseAssignmentStrategy('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
        expect(ParseAssignmentStrategy('   ')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
        expect(ParseAssignmentStrategy('{not-json}')).toBeNull();
    });

    it('should return null for valid JSON without type field', () => {
        expect(ParseAssignmentStrategy('{"userID": "abc"}')).toBeNull();
    });

    it('should return null for JSON array', () => {
        expect(ParseAssignmentStrategy('[1, 2, 3]')).toBeNull();
    });

    it('should return null for JSON primitive', () => {
        expect(ParseAssignmentStrategy('"hello"')).toBeNull();
    });

    it('should parse a minimal RunUser strategy', () => {
        const result = ParseAssignmentStrategy('{"type": "RunUser"}');
        expect(result).toEqual({ type: 'RunUser' });
    });

    it('should parse a SpecificUser strategy with userID', () => {
        const json = '{"type": "SpecificUser", "userID": "abc-123"}';
        const result = ParseAssignmentStrategy(json);
        expect(result).toEqual({ type: 'SpecificUser', userID: 'abc-123' });
    });

    it('should parse a List strategy with all fields', () => {
        const strategy: AgentRequestAssignmentStrategy = {
            type: 'List',
            listID: 'list-456',
            listStrategy: 'RoundRobin',
            priority: 75,
            expirationMinutes: 120,
        };
        const result = ParseAssignmentStrategy(JSON.stringify(strategy));
        expect(result).toEqual(strategy);
    });

    it('should parse a SharedInbox strategy', () => {
        const json = '{"type": "SharedInbox", "listID": "inbox-list"}';
        const result = ParseAssignmentStrategy(json);
        expect(result).toEqual({ type: 'SharedInbox', listID: 'inbox-list' });
    });

    it('should parse AgentOwner strategy', () => {
        const json = '{"type": "AgentOwner"}';
        const result = ParseAssignmentStrategy(json);
        expect(result).toEqual({ type: 'AgentOwner' });
    });

    it('should preserve extra fields (forward-compat)', () => {
        const json = '{"type": "RunUser", "futureField": true}';
        const result = ParseAssignmentStrategy(json);
        expect(result).not.toBeNull();
        expect(result!.type).toBe('RunUser');
        expect((result as Record<string, unknown>)['futureField']).toBe(true);
    });
});

describe('mergeAssignmentStrategies', () => {
    const baseStrategy: AgentRequestAssignmentStrategy = {
        type: 'RunUser',
        priority: 50,
        expirationMinutes: 60,
    };

    it('should return null when both inputs are null', () => {
        expect(MergeAssignmentStrategies(null, null)).toBeNull();
    });

    it('should return null when both inputs are undefined', () => {
        expect(MergeAssignmentStrategies(undefined, undefined)).toBeNull();
    });

    it('should return base when override is null', () => {
        expect(MergeAssignmentStrategies(baseStrategy, null)).toEqual(baseStrategy);
    });

    it('should return base when override is undefined', () => {
        expect(MergeAssignmentStrategies(baseStrategy, undefined)).toEqual(baseStrategy);
    });

    it('should return override when base is null', () => {
        const override: AgentRequestAssignmentStrategy = { type: 'AgentOwner' };
        expect(MergeAssignmentStrategies(null, override)).toEqual(override);
    });

    it('should return override when base is undefined', () => {
        const override: AgentRequestAssignmentStrategy = { type: 'AgentOwner' };
        expect(MergeAssignmentStrategies(undefined, override)).toEqual(override);
    });

    it('should prefer override type over base type', () => {
        const override: AgentRequestAssignmentStrategy = { type: 'SpecificUser', userID: 'u1' };
        const result = MergeAssignmentStrategies(baseStrategy, override);
        expect(result!.type).toBe('SpecificUser');
        expect(result!.userID).toBe('u1');
    });

    it('should fall back to base for undefined override fields', () => {
        const override: AgentRequestAssignmentStrategy = { type: 'AgentOwner' };
        const result = MergeAssignmentStrategies(baseStrategy, override);
        expect(result!.type).toBe('AgentOwner');
        expect(result!.priority).toBe(50);
        expect(result!.expirationMinutes).toBe(60);
    });

    it('should override priority and expirationMinutes', () => {
        const override: AgentRequestAssignmentStrategy = {
            type: 'RunUser',
            priority: 10,
            expirationMinutes: 30,
        };
        const result = MergeAssignmentStrategies(baseStrategy, override);
        expect(result!.priority).toBe(10);
        expect(result!.expirationMinutes).toBe(30);
    });

    it('should merge List strategy fields from both sides', () => {
        const base: AgentRequestAssignmentStrategy = {
            type: 'List',
            listID: 'list-1',
            listStrategy: 'RoundRobin',
            priority: 50,
        };
        const override: AgentRequestAssignmentStrategy = {
            type: 'List',
            listStrategy: 'LeastBusy',
            expirationMinutes: 120,
        };
        const result = MergeAssignmentStrategies(base, override);
        expect(result).toEqual({
            type: 'List',
            listID: 'list-1',          // from base
            listStrategy: 'LeastBusy', // from override
            priority: 50,              // from base
            expirationMinutes: 120,    // from override
            userID: undefined,         // neither has it
        });
    });

    it('should not let 0 be treated as null (0 is a valid priority)', () => {
        const override: AgentRequestAssignmentStrategy = {
            type: 'RunUser',
            priority: 0,
        };
        const result = MergeAssignmentStrategies(baseStrategy, override);
        // 0 ?? 50 = 0 because ?? only matches null/undefined, not falsy
        expect(result!.priority).toBe(0);
    });
});
