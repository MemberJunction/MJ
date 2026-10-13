/**
 * Unit tests for the agent-management MCP tool group's pure helpers.
 *
 * The helpers module is dependency-free by design (type-only imports), so it
 * can be tested without the full MemberJunction dependency chain — same
 * approach as config-schemas.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_BUILDER_AGENTS,
    MatchesNamePattern,
    ValidateCreateSpec,
    ValidateUpdateSpec
} from '../tools/agentManagementHelpers.js';

describe('validateCreateSpec', () => {
    it('accepts a minimal spec with a Name and no ID', () => {
        expect(ValidateCreateSpec({ Name: 'My Agent' })).toBeNull();
    });

    it('accepts a spec with an empty-string ID', () => {
        expect(ValidateCreateSpec({ ID: '', Name: 'My Agent' })).toBeNull();
    });

    it('rejects null, undefined, arrays, and non-objects', () => {
        expect(ValidateCreateSpec(null)).toMatch(/must be a JSON object/);
        expect(ValidateCreateSpec(undefined)).toMatch(/must be a JSON object/);
        expect(ValidateCreateSpec([] as unknown as Record<string, never>)).toMatch(/must be a JSON object/);
    });

    it('rejects a missing, empty, or whitespace-only Name', () => {
        expect(ValidateCreateSpec({})).toMatch(/Name is required/);
        expect(ValidateCreateSpec({ Name: '' })).toMatch(/Name is required/);
        expect(ValidateCreateSpec({ Name: '   ' })).toMatch(/Name is required/);
    });

    it('rejects a spec that carries an ID', () => {
        expect(ValidateCreateSpec({ ID: 'ABC-123', Name: 'My Agent' })).toMatch(/must not carry an ID/);
    });
});

describe('validateUpdateSpec', () => {
    it('accepts a spec with both ID and Name', () => {
        expect(ValidateUpdateSpec({ ID: '00000000-0000-0000-0000-000000000001', Name: 'My Agent' })).toBeNull();
    });

    it('rejects a spec without an ID', () => {
        expect(ValidateUpdateSpec({ Name: 'My Agent' })).toMatch(/must carry the ID/);
        expect(ValidateUpdateSpec({ ID: '', Name: 'My Agent' })).toMatch(/must carry the ID/);
        expect(ValidateUpdateSpec({ ID: '   ', Name: 'My Agent' })).toMatch(/must carry the ID/);
    });

    it('rejects a spec without a Name', () => {
        expect(ValidateUpdateSpec({ ID: '00000000-0000-0000-0000-000000000001' })).toMatch(/Name is required/);
    });

    it('rejects non-object specs', () => {
        expect(ValidateUpdateSpec(null)).toMatch(/must be a JSON object/);
    });
});

describe('matchesNamePattern', () => {
    it('matches everything with *', () => {
        expect(MatchesNamePattern('Anything', '*')).toBe(true);
        expect(MatchesNamePattern(null, '*')).toBe(true);
    });

    it('returns false for null/undefined names on non-* patterns', () => {
        expect(MatchesNamePattern(null, 'Agent')).toBe(false);
        expect(MatchesNamePattern(undefined, 'Agent*')).toBe(false);
    });

    it('does exact case-insensitive matching without wildcards', () => {
        expect(MatchesNamePattern('ActionSmith', 'actionsmith')).toBe(true);
        expect(MatchesNamePattern('ActionSmith', 'Action')).toBe(false);
    });

    it('supports prefix, suffix, and contains wildcards', () => {
        expect(MatchesNamePattern('Research Agent', '*Agent')).toBe(true);
        expect(MatchesNamePattern('Research Agent', 'Research*')).toBe(true);
        expect(MatchesNamePattern('Research Agent', '*search*')).toBe(true);
        expect(MatchesNamePattern('Research Agent', '*Bot')).toBe(false);
    });

    it('escapes regex metacharacters in patterns', () => {
        expect(MatchesNamePattern('Agent (v2)', 'Agent (v2)')).toBe(true);
        expect(MatchesNamePattern('Agent v2', 'Agent (v2)')).toBe(false);
        expect(MatchesNamePattern('A.B Agent', 'A.B*')).toBe(true);
        expect(MatchesNamePattern('AxB Agent', 'A.B*')).toBe(false);
    });
});

describe('DEFAULT_BUILDER_AGENTS', () => {
    it('exposes the ActionSmith and Codesmith builder agents by default', () => {
        expect(DEFAULT_BUILDER_AGENTS).toContain('ActionSmith');
        expect(DEFAULT_BUILDER_AGENTS).toContain('Codesmith Agent');
    });
});
