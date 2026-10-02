import { describe, it, expect } from 'vitest';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import {
    AccumulateRealtimeChannelsConfig,
    DeclaresNativeTools,
    NormalizeChannelKey,
    NormalizeRealtimeChannelsConfig,
    ResolveRealtimeChannelScope,
    SelectNativeChannelTools,
    type RealtimeChannelScopeCandidate,
    type ResolvedRealtimeChannel,
} from '../realtime-channel-scope';

const candidate = (key: string, over: Partial<RealtimeChannelScopeCandidate> = {}): RealtimeChannelScopeCandidate => ({
    Key: key,
    DefaultAvailability: 'all-sessions',
    DisplayPolicy: 'open-on-start',
    MaxExposure: 'state',
    Registry: 'active',
    ...over,
});

const keysOf = (result: { Channels: ResolvedRealtimeChannel[] }): string[] => result.Channels.map(c => c.Key);

describe('NormalizeRealtimeChannelsConfig', () => {
    it('keeps valid members, trims and de-duplicates keys case-insensitively', () => {
        expect(
            NormalizeRealtimeChannelsConfig({
                include: [' Whiteboard ', 'whiteboard', 'Media', '', 7],
                exclude: ['Remote Browser'],
                config: { Media: { maxItems: 3 }, Bad: 'nope', '': { x: 1 } },
                displayPolicy: { Media: 'on-demand', Whiteboard: 'sideways' },
            }),
        ).toEqual({
            include: ['Whiteboard', 'Media'],
            exclude: ['Remote Browser'],
            config: { Media: { maxItems: 3 } },
            displayPolicy: { Media: 'on-demand' },
        });
    });

    it('returns undefined for anything that contributes nothing', () => {
        expect(NormalizeRealtimeChannelsConfig(undefined)).toBeUndefined();
        expect(NormalizeRealtimeChannelsConfig(null)).toBeUndefined();
        expect(NormalizeRealtimeChannelsConfig([])).toBeUndefined();
        expect(NormalizeRealtimeChannelsConfig('x')).toBeUndefined();
        expect(NormalizeRealtimeChannelsConfig({ include: 'Whiteboard', exclude: [], config: [], displayPolicy: {} })).toBeUndefined();
    });
});

describe('AccumulateRealtimeChannelsConfig — per-channel, most specific layer wins', () => {
    it('returns undefined when no layer contributes', () => {
        expect(AccumulateRealtimeChannelsConfig([undefined, null, {}, 5])).toBeUndefined();
    });

    it('unions decisions about DIFFERENT channels across layers (arrays are not replaced)', () => {
        const folded = AccumulateRealtimeChannelsConfig([
            { exclude: ['Remote Browser'] },
            { exclude: ['Media'] },
        ]);
        expect(folded?.exclude).toEqual(['Remote Browser', 'Media']);
    });

    it('lets a later layer reverse an earlier decision about the SAME channel', () => {
        const folded = AccumulateRealtimeChannelsConfig([
            { exclude: ['Whiteboard'] },
            { include: ['whiteboard'] },
        ]);
        expect(folded).toEqual({ include: ['whiteboard'] });
    });

    it('within one layer, exclude beats include', () => {
        const folded = AccumulateRealtimeChannelsConfig([{ include: ['Whiteboard', 'Media'], exclude: ['Whiteboard'] }]);
        expect(folded).toEqual({ include: ['Media'], exclude: ['Whiteboard'] });
    });

    it('deep-merges per-channel config (later wins) and merges display policy per key', () => {
        const folded = AccumulateRealtimeChannelsConfig([
            { config: { IdentityVerification: { policy: { blocked: ['a.com'], ttl: 10 } } }, displayPolicy: { Media: 'on-demand' } },
            { config: { identityverification: { policy: { ttl: 30 } } }, displayPolicy: { Media: 'open-on-start', Whiteboard: 'headless' } },
        ]);
        expect(folded?.config).toEqual({ identityverification: { policy: { blocked: ['a.com'], ttl: 30 } } });
        expect(folded?.displayPolicy).toEqual({ Media: 'open-on-start', Whiteboard: 'headless' });
    });
});

describe('ResolveRealtimeChannelScope — the layer matrix', () => {
    it('code default: every all-sessions channel is in; an opt-in channel is not', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [candidate('Whiteboard'), candidate('IdentityVerification', { DefaultAvailability: 'opt-in' })],
        });
        expect(keysOf(result)).toEqual(['Whiteboard']);
        expect(result.Excluded).toEqual([{ Key: 'IdentityVerification', Reason: 'opt-in-not-included' }]);
        expect(result.Channels[0].Source).toBe('default');
    });

    it('agent/app config: include turns an opt-in channel on; exclude turns an all-sessions one off', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [
                candidate('Whiteboard'),
                candidate('Media'),
                candidate('IdentityVerification', { DefaultAvailability: 'opt-in' }),
            ],
            Config: { include: ['identityverification'], exclude: ['MEDIA'] },
        });
        expect(keysOf(result)).toEqual(['Whiteboard', 'IdentityVerification']);
        expect(result.Channels[1].Source).toBe('config');
        expect(result.Excluded).toEqual([{ Key: 'Media', Reason: 'excluded-by-config' }]);
    });

    it('host: a host-declared channel is in even when opt-in and with no registry row', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [candidate('PageWidget', { DefaultAvailability: 'opt-in', Registry: 'none', HostDeclared: true })],
        });
        expect(keysOf(result)).toEqual(['PageWidget']);
        expect(result.Channels[0].Source).toBe('host');
    });

    it('a channel with no registry row that no host declared is unknown', () => {
        const result = ResolveRealtimeChannelScope({ Candidates: [candidate('Ghost', { Registry: 'none' })] });
        expect(result.Channels).toEqual([]);
        expect(result.Excluded).toEqual([{ Key: 'Ghost', Reason: 'unknown-channel' }]);
    });

    it('KILL SWITCH: an inactive registry row is excluded even when host-declared AND explicitly included', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [candidate('Whiteboard', { Registry: 'inactive', HostDeclared: true })],
            Config: { include: ['Whiteboard'] },
        });
        expect(result.Channels).toEqual([]);
        expect(result.Excluded).toEqual([{ Key: 'Whiteboard', Reason: 'inactive-registry-row' }]);
    });

    it('HOST CANNOT OVERRIDE POLICY: an agent/app exclude vetoes a host-declared channel', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [candidate('Whiteboard', { HostDeclared: true })],
            Config: { exclude: ['Whiteboard'] },
        });
        expect(result.Channels).toEqual([]);
        expect(result.Excluded).toEqual([{ Key: 'Whiteboard', Reason: 'excluded-by-config' }]);
    });

    it('display policy precedence: config override > host request > code default', () => {
        const base = candidate('Media', { DisplayPolicy: 'open-on-start' });
        expect(ResolveRealtimeChannelScope({ Candidates: [base] }).Channels[0].DisplayPolicy).toBe('open-on-start');
        expect(
            ResolveRealtimeChannelScope({ Candidates: [{ ...base, HostDeclared: true, HostDisplayPolicy: 'headless' }] }).Channels[0].DisplayPolicy,
        ).toBe('headless');
        expect(
            ResolveRealtimeChannelScope({
                Candidates: [{ ...base, HostDeclared: true, HostDisplayPolicy: 'headless' }],
                Config: { displayPolicy: { MEDIA: 'on-demand' } },
            }).Channels[0].DisplayPolicy,
        ).toBe('on-demand');
    });

    it('per-channel config: host config is a DEFAULT beneath agent/app config, never above it', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [candidate('IdentityVerification', { HostDeclared: true, HostConfig: { requireBusinessDomain: false, label: 'host' } })],
            Config: { config: { identityverification: { requireBusinessDomain: true } } },
        });
        expect(result.Channels[0].Config).toEqual({ requireBusinessDomain: true, label: 'host' });
    });

    it('carries the descriptor ceiling through unchanged and omits Config when there is none', () => {
        const result = ResolveRealtimeChannelScope({ Candidates: [candidate('Whiteboard', { MaxExposure: 'pixels' })] });
        expect(result.Channels[0].MaxExposure).toBe('pixels');
        expect(result.Channels[0]).not.toHaveProperty('Config');
    });

    it('preserves candidate order and ignores duplicate / blank keys (first wins)', () => {
        const result = ResolveRealtimeChannelScope({
            Candidates: [candidate('B'), candidate('A'), candidate('b', { DisplayPolicy: 'headless' }), candidate('  ')],
        });
        expect(keysOf(result)).toEqual(['B', 'A']);
        expect(result.Channels[0].DisplayPolicy).toBe('open-on-start');
    });

    it('with no candidates and no config, resolves to nothing (and never throws)', () => {
        expect(ResolveRealtimeChannelScope({ Candidates: [] })).toEqual({ Channels: [], Excluded: [] });
        expect(ResolveRealtimeChannelScope({ Candidates: [], Config: null })).toEqual({ Channels: [], Excluded: [] });
    });
});

describe('native tool selection', () => {
    const tool = (name: string): RealtimeToolDefinition => ({ Name: name, Description: name, ParametersSchema: { type: 'object' } });

    it('on-demand is the only display policy that withholds native tools', () => {
        expect(DeclaresNativeTools('open-on-start')).toBe(true);
        expect(DeclaresNativeTools('headless')).toBe(true);
        expect(DeclaresNativeTools('on-demand')).toBe(false);
    });

    it('selects tools only for in-scope channels that declare natively, in channel order', () => {
        const channels: ResolvedRealtimeChannel[] = [
            { Key: 'Whiteboard', DisplayPolicy: 'open-on-start', MaxExposure: 'pixels', Source: 'default' },
            { Key: 'Media', DisplayPolicy: 'on-demand', MaxExposure: 'state', Source: 'default' },
            { Key: 'ClientContextChannel', DisplayPolicy: 'headless', MaxExposure: 'none', Source: 'default' },
        ];
        const tools = new Map<string, RealtimeToolDefinition[]>([
            ['whiteboard', [tool('Whiteboard_AddNote')]],
            ['Media', [tool('Media_ShowMedia')]],
            ['ClientContextChannel', [tool('ContextTool')]],
            ['RemoteBrowser', [tool('browser_Click')]], // out of scope — never selected
        ]);
        expect(SelectNativeChannelTools(channels, tools).map(t => t.Name)).toEqual(['Whiteboard_AddNote', 'ContextTool']);
    });

    it('tolerates a channel with no tool entry', () => {
        expect(
            SelectNativeChannelTools([{ Key: 'X', DisplayPolicy: 'open-on-start', MaxExposure: 'none', Source: 'default' }], new Map()),
        ).toEqual([]);
    });
});

describe('NormalizeChannelKey', () => {
    it('trims and lower-cases', () => {
        expect(NormalizeChannelKey('  Remote Browser ')).toBe('remote browser');
    });
});
