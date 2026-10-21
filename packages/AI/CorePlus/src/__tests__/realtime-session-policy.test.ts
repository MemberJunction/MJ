import { describe, it, expect } from 'vitest';
import {
    DEFAULT_REALTIME_CHANNEL_CANDIDATE_LIMITS,
    IsValidRealtimeToolDefinition,
    ParseRealtimeChannelCandidates,
    ParseRealtimeSessionClientPolicy,
    type RealtimeChannelCandidate,
    type RealtimeSessionClientPolicy,
} from '../realtime-session-policy';

const tool = { Name: 'Whiteboard_AddNote', Description: 'Add a note', ParametersSchema: { type: 'object' } };

const wireCandidate = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    Key: 'Whiteboard',
    DefaultAvailability: 'all-sessions',
    DisplayPolicy: 'open-on-start',
    MaxExposure: 'pixels',
    ToolNamePrefix: 'Whiteboard_',
    Tools: [tool],
    ...over,
});

describe('IsValidRealtimeToolDefinition', () => {
    it('accepts a well-formed definition', () => {
        expect(IsValidRealtimeToolDefinition(tool)).toBe(true);
    });

    it('rejects blank names/descriptions, over-long names and non-object schemas', () => {
        expect(IsValidRealtimeToolDefinition({ ...tool, Name: ' ' })).toBe(false);
        expect(IsValidRealtimeToolDefinition({ ...tool, Name: 'x'.repeat(129) })).toBe(false);
        expect(IsValidRealtimeToolDefinition({ ...tool, Description: '' })).toBe(false);
        expect(IsValidRealtimeToolDefinition({ ...tool, ParametersSchema: [] })).toBe(false);
        expect(IsValidRealtimeToolDefinition(null)).toBe(false);
        expect(IsValidRealtimeToolDefinition('x')).toBe(false);
    });
});

describe('ParseRealtimeChannelCandidates', () => {
    it('returns nothing for an absent payload', () => {
        expect(ParseRealtimeChannelCandidates(undefined)).toEqual({ Candidates: [], Rejected: [] });
        expect(ParseRealtimeChannelCandidates('')).toEqual({ Candidates: [], Rejected: [] });
    });

    it('parses a valid candidate, including the host fields', () => {
        const parsed = ParseRealtimeChannelCandidates(
            JSON.stringify([wireCandidate({ HostDeclared: true, HostConfig: { a: 1 }, HostDisplayPolicy: 'on-demand' })]),
        );
        expect(parsed.Rejected).toEqual([]);
        const expected: RealtimeChannelCandidate = {
            Key: 'Whiteboard',
            DefaultAvailability: 'all-sessions',
            DisplayPolicy: 'open-on-start',
            MaxExposure: 'pixels',
            ToolNamePrefix: 'Whiteboard_',
            Tools: [tool],
            HostDeclared: true,
            HostConfig: { a: 1 },
            HostDisplayPolicy: 'on-demand',
        };
        expect(parsed.Candidates).toEqual([expected]);
    });

    it('tolerates a candidate with no Tools / prefix (a channel with no native tools)', () => {
        const parsed = ParseRealtimeChannelCandidates(JSON.stringify([wireCandidate({ Tools: undefined, ToolNamePrefix: undefined })]));
        expect(parsed.Candidates[0].Tools).toEqual([]);
        expect(parsed.Candidates[0].ToolNamePrefix).toBe('');
    });

    it.each([
        ['an invalid availability', { DefaultAvailability: 'sometimes' }, 'DefaultAvailability'],
        ['an invalid display policy', { DisplayPolicy: 'floating' }, 'DisplayPolicy'],
        ['an invalid exposure', { MaxExposure: 'everything' }, 'MaxExposure'],
        ['a missing key', { Key: '' }, 'no valid Key'],
        ['non-array tools', { Tools: 'nope' }, 'Tools is not an array'],
    ])('drops a candidate with %s and says why', (_label, over, fragment) => {
        const parsed = ParseRealtimeChannelCandidates(JSON.stringify([wireCandidate(over), wireCandidate({ Key: 'Good' })]));
        expect(parsed.Candidates.map(c => c.Key)).toEqual(['Good']);
        expect(parsed.Rejected).toHaveLength(1);
        expect(parsed.Rejected[0]).toContain(fragment);
    });

    it('filters malformed tools out of an otherwise valid candidate', () => {
        const parsed = ParseRealtimeChannelCandidates(JSON.stringify([wireCandidate({ Tools: [tool, { Name: '' }] })]));
        expect(parsed.Candidates[0].Tools).toEqual([tool]);
    });

    it('de-duplicates by key (case-insensitive, first wins)', () => {
        const parsed = ParseRealtimeChannelCandidates(JSON.stringify([wireCandidate(), wireCandidate({ Key: 'whiteboard', DisplayPolicy: 'headless' })]));
        expect(parsed.Candidates).toHaveLength(1);
        expect(parsed.Candidates[0].DisplayPolicy).toBe('open-on-start');
    });

    it('rejects wholesale: invalid JSON, a non-array, too many candidates, too many tools, an oversized payload', () => {
        expect(ParseRealtimeChannelCandidates('{nope').Rejected[0]).toContain('not valid JSON');
        expect(ParseRealtimeChannelCandidates('{}').Rejected[0]).toContain('expected a JSON array');
        const tooMany = Array.from({ length: DEFAULT_REALTIME_CHANNEL_CANDIDATE_LIMITS.MaxCandidates + 1 }, (_, i) => wireCandidate({ Key: `C${i}` }));
        expect(ParseRealtimeChannelCandidates(JSON.stringify(tooMany)).Rejected[0]).toContain('exceeds the cap');
        const manyTools = Array.from({ length: 5 }, () => tool);
        const limited = ParseRealtimeChannelCandidates(JSON.stringify([wireCandidate({ Tools: manyTools })]), {
            MaxCandidates: 4,
            MaxToolsPerCandidate: 2,
            MaxJsonChars: 10_000,
        });
        expect(limited.Candidates).toEqual([]);
        expect(limited.Rejected[0]).toContain('exceeds the cap of 2');
        const oversized = ParseRealtimeChannelCandidates(JSON.stringify([wireCandidate()]), { MaxCandidates: 4, MaxToolsPerCandidate: 4, MaxJsonChars: 10 });
        expect(oversized.Rejected[0]).toContain('chars exceeds the cap');
    });
});

describe('ParseRealtimeSessionClientPolicy', () => {
    const policy: RealtimeSessionClientPolicy = {
        Version: 1,
        Channels: [
            { Key: 'Whiteboard', DisplayPolicy: 'open-on-start', MaxExposure: 'pixels', Source: 'default' },
            { Key: 'Form', DisplayPolicy: 'on-demand', MaxExposure: 'state', Source: 'config', Config: { x: 1 } },
        ],
        ExcludedChannels: [{ Key: 'Media', Reason: 'excluded-by-config' }],
        ClientTools: { App: [{ Name: 'Export', Description: 'd', InputSchema: { type: 'object' } }] },
    };

    it('round-trips a policy', () => {
        expect(ParseRealtimeSessionClientPolicy(JSON.stringify(policy))).toEqual(policy);
    });

    it('round-trips the server-decided exposure and its limits', () => {
        const withExposure: RealtimeSessionClientPolicy = {
            Version: 1,
            Channels: [
                {
                    Key: 'Whiteboard',
                    DisplayPolicy: 'open-on-start',
                    MaxExposure: 'pixels',
                    Exposure: 'state',
                    ExposureLimits: [{ Source: 'zero-data-retention', Level: 'state', Reason: 'because' }],
                    Source: 'default',
                },
            ],
        };
        expect(ParseRealtimeSessionClientPolicy(JSON.stringify(withExposure))).toEqual(withExposure);
    });

    it('an older server policy with no Exposure still parses (readers fall back to MaxExposure)', () => {
        const parsed = ParseRealtimeSessionClientPolicy(JSON.stringify(policy));
        expect(parsed?.Channels[0].Exposure).toBeUndefined();
    });

    it('drops an invalid Exposure and malformed limits rather than trusting them', () => {
        const parsed = ParseRealtimeSessionClientPolicy(
            JSON.stringify({
                Version: 1,
                Channels: [
                    {
                        Key: 'W',
                        DisplayPolicy: 'open-on-start',
                        MaxExposure: 'pixels',
                        Exposure: 'everything',
                        ExposureLimits: [{ Source: 'agent', Level: 'bogus', Reason: 'x' }, { Source: 'nope', Level: 'state', Reason: 'x' }, 'junk'],
                        Source: 'default',
                    },
                ],
            })
        );
        expect(parsed?.Channels[0].Exposure).toBeUndefined();
        expect(parsed?.Channels[0].ExposureLimits).toBeUndefined();
    });

    it('returns null for anything unusable, so the caller falls back to local resolution', () => {
        expect(ParseRealtimeSessionClientPolicy(undefined)).toBeNull();
        expect(ParseRealtimeSessionClientPolicy('')).toBeNull();
        expect(ParseRealtimeSessionClientPolicy('{bad')).toBeNull();
        expect(ParseRealtimeSessionClientPolicy('[]')).toBeNull();
        expect(ParseRealtimeSessionClientPolicy(JSON.stringify({ Version: 2, Channels: [] }))).toBeNull();
        expect(ParseRealtimeSessionClientPolicy(JSON.stringify({ Version: 1 }))).toBeNull();
    });

    it('drops malformed channels, exclusions and tools but keeps the rest', () => {
        const parsed = ParseRealtimeSessionClientPolicy(
            JSON.stringify({
                Version: 1,
                Channels: [{ Key: 'Ok', DisplayPolicy: 'headless', MaxExposure: 'none' }, { Key: 'Bad', DisplayPolicy: 'x', MaxExposure: 'none' }, 'junk'],
                ExcludedChannels: [{ Key: 'A', Reason: 'unknown-channel' }, { Key: 'B', Reason: 'because' }],
                ClientTools: { App: [{ Name: 'T', Description: 'd' }, { Name: '' }], Static: 'nope' },
            }),
        );
        expect(parsed?.Channels).toEqual([{ Key: 'Ok', DisplayPolicy: 'headless', MaxExposure: 'none', Source: 'default' }]);
        expect(parsed?.ExcludedChannels).toEqual([{ Key: 'A', Reason: 'unknown-channel' }]);
        expect(parsed?.ClientTools?.App).toEqual([{ Name: 'T', Description: 'd', InputSchema: {} }]);
        expect(parsed?.ClientTools?.Static).toBeUndefined();
    });
});
