import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { AgentRunAudience } from '@memberjunction/ai-core-plus';
import { AgentAudienceAddsReader, AgentAudienceProblem, AgentAudienceReaderIDs, MatchAudienceUsers } from '../agent-audience';

const CALLER = 'AAAAAAAA-0000-4000-8000-0000000000C1';
const READER = 'aaaaaaaa-0000-4000-8000-0000000000b1';

describe('AgentAudienceProblem', () => {
    it('accepts no audience, a Caller audience with no readers, and an Intersection with readers', () => {
        expect(AgentAudienceProblem(undefined)).toBeNull();
        expect(AgentAudienceProblem({ Mode: 'Caller', UserIDs: [] })).toBeNull();
        expect(AgentAudienceProblem({ Mode: 'Caller' })).toBeNull();
        expect(AgentAudienceProblem({ Mode: 'Intersection', UserIDs: [READER] })).toBeNull();
    });

    it.each<[string, unknown, RegExp]>([
        ['null', null, /expected \{ Mode, UserIDs \}, got null/],
        ['an array', [READER], /got an array/],
        ['a string', 'everyone', /got string/],
        ['an unknown Mode', { Mode: 'Union', UserIDs: [READER] }, /Mode must be 'Caller' or 'Intersection', got 'Union'/],
        ['a missing Mode', { UserIDs: [READER] }, /Mode must be/],
        ['an Intersection with no UserIDs', { Mode: 'Intersection' }, /needs UserIDs/],
        ['an Intersection with UserIDs not an array', { Mode: 'Intersection', UserIDs: READER }, /needs UserIDs/],
        ['an empty Intersection', { Mode: 'Intersection', UserIDs: [] }, /at least one ID/],
        ['a blank ID', { Mode: 'Intersection', UserIDs: [READER, '  '] }, /UserIDs\[1\] is blank/],
        ['a non-string ID', { Mode: 'Intersection', UserIDs: [42] }, /UserIDs\[0\] is blank or not a string/],
        ['a Caller audience with readers', { Mode: 'Caller', UserIDs: [READER] }, /takes no UserIDs \(got 1 ID\(s\)\)/],
    ])('refuses %s', (_label, audience, message) => {
        expect(AgentAudienceProblem(audience)).toMatch(message);
    });

    // `mode in { Caller, Intersection }` accepted every name Object.prototype carries, so such an audience passed
    // validation, added no reader (it is not 'Intersection') and every gate was skipped.
    it.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'])(
        "refuses the inherited name '%s' as a Mode, with or without readers",
        (mode) => {
            expect(AgentAudienceProblem({ Mode: mode, UserIDs: [READER] })).toMatch(/Mode must be 'Caller' or 'Intersection'/);
            expect(AgentAudienceProblem({ Mode: mode })).toMatch(/Mode must be 'Caller' or 'Intersection'/);
            expect(AgentAudienceAddsReader({ Mode: mode, UserIDs: [READER] } as unknown as AgentRunAudience, CALLER)).toBe(true);
        },
    );
});

describe('AgentAudienceReaderIDs', () => {
    it('lists each reader beyond the caller once, normalized, the caller left out case-insensitively', () => {
        const audience: AgentRunAudience = { Mode: 'Intersection', UserIDs: [READER.toUpperCase(), CALLER.toLowerCase(), READER] };
        expect(AgentAudienceReaderIDs(audience, CALLER)).toEqual([READER]);
    });

    it('is empty with no audience, a Caller audience, or when the only reader is the caller', () => {
        expect(AgentAudienceReaderIDs(undefined, CALLER)).toEqual([]);
        expect(AgentAudienceReaderIDs({ Mode: 'Caller', UserIDs: [] }, CALLER)).toEqual([]);
        expect(AgentAudienceReaderIDs({ Mode: 'Intersection', UserIDs: [CALLER] }, CALLER)).toEqual([]);
    });

    it('keeps every reader when there is no caller ID', () => {
        expect(AgentAudienceReaderIDs({ Mode: 'Intersection', UserIDs: [READER] }, undefined)).toEqual([READER]);
    });
});

describe('AgentAudienceAddsReader', () => {
    it('is true only when the audience adds someone besides the caller', () => {
        expect(AgentAudienceAddsReader(undefined, CALLER)).toBe(false);
        expect(AgentAudienceAddsReader({ Mode: 'Caller', UserIDs: [] }, CALLER)).toBe(false);
        expect(AgentAudienceAddsReader({ Mode: 'Intersection', UserIDs: [CALLER] }, CALLER)).toBe(false);
        expect(AgentAudienceAddsReader({ Mode: 'Intersection', UserIDs: [CALLER, READER] }, CALLER)).toBe(true);
    });

    it('fails closed on a malformed audience', () => {
        expect(AgentAudienceAddsReader({ Mode: 'Intersection', UserIDs: [] }, CALLER)).toBe(true);
        expect(AgentAudienceAddsReader({ Mode: 'Union', UserIDs: [] } as unknown as AgentRunAudience, CALLER)).toBe(true);
    });
});

describe('MatchAudienceUsers', () => {
    const user = (ID: string): UserInfo => ({ ID, Name: ID, UserRoles: [] }) as unknown as UserInfo;

    it('matches IDs to users case-insensitively, in ID order, and reports the IDs no user has', () => {
        const reader = user(READER.toUpperCase());
        const other = user('aaaaaaaa-0000-4000-8000-0000000000d1');
        const match = MatchAudienceUsers(['aaaaaaaa-0000-4000-8000-0000000000d1', 'missing-id', READER], [reader, other]);
        expect(match.Readers).toEqual([other, reader]);
        expect(match.MissingIDs).toEqual(['missing-id']);
    });
});
