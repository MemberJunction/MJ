import { describe, it, expect } from 'vitest';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import type { RealtimeChannelCandidate } from '@memberjunction/ai-core-plus';
import {
    BuildSessionChannelPolicy,
    ExcludedChannelKeys,
    InSessionChannelKeys,
    ResolveCandidateRegistryState,
} from '../realtime/realtime-channel-policy';

const tool = (Name: string): RealtimeToolDefinition => ({ Name, Description: `${Name} tool`, ParametersSchema: { type: 'object' } });

function candidate(key: string, overrides: Partial<RealtimeChannelCandidate> = {}): RealtimeChannelCandidate {
    return {
        Key: key,
        DefaultAvailability: 'all-sessions',
        DisplayPolicy: 'open-on-start',
        MaxExposure: 'state',
        ToolNamePrefix: `${key}_`,
        Tools: [tool(`${key}_Do`)],
        ...overrides,
    };
}

const REGISTRY = [
    { Name: 'Whiteboard', IsActive: true },
    { Name: 'RemoteBrowser', IsActive: true },
    { Name: 'Media', IsActive: false },
    { Name: 'Form', IsActive: true },
];

describe('ResolveCandidateRegistryState', () => {
    it('reads the server registry case-insensitively: active, inactive (the kill switch), or none', () => {
        expect(ResolveCandidateRegistryState('whiteboard', REGISTRY)).toBe('active');
        expect(ResolveCandidateRegistryState('MEDIA', REGISTRY)).toBe('inactive');
        expect(ResolveCandidateRegistryState('Embed', REGISTRY)).toBe('none');
    });
});

describe('BuildSessionChannelPolicy', () => {
    it('puts all-sessions channels in the session by default and keeps their declared tools', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Whiteboard')],
            Registry: REGISTRY,
            ClientTools: [tool('Whiteboard_Do')],
        });
        expect(out.Policy.Channels.map((c) => c.Key)).toEqual(['Whiteboard']);
        expect(out.ClientTools?.map((t) => t.Name)).toEqual(['Whiteboard_Do']);
    });

    it('an agent/app exclude removes the channel AND its natively declared tools', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Whiteboard'), candidate('RemoteBrowser')],
            ChannelsConfig: { exclude: ['RemoteBrowser'] },
            Registry: REGISTRY,
            ClientTools: [tool('Whiteboard_Do'), tool('RemoteBrowser_Do')],
        });
        expect(InSessionChannelKeys(out.Policy)).toEqual(['Whiteboard']);
        expect(ExcludedChannelKeys(out.Policy)).toEqual(['RemoteBrowser']);
        expect(out.Policy.ExcludedChannels).toEqual([{ Key: 'RemoteBrowser', Reason: 'excluded-by-config' }]);
        expect(out.ClientTools?.map((t) => t.Name)).toEqual(['Whiteboard_Do']);
    });

    it('the registry kill switch beats an explicit include and a host declaration', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Media', { HostDeclared: true })],
            ChannelsConfig: { include: ['Media'] },
            Registry: REGISTRY,
            ClientTools: [tool('Media_Do')],
        });
        expect(out.Policy.Channels).toEqual([]);
        expect(out.Policy.ExcludedChannels).toEqual([{ Key: 'Media', Reason: 'inactive-registry-row' }]);
        expect(out.ClientTools).toBeUndefined();
    });

    it('an opt-in channel is out unless included — and an included one is ADDED to the tools even if the client did not declare them', () => {
        const form = candidate('Form', { DefaultAvailability: 'opt-in' });
        const without = BuildSessionChannelPolicy({ Candidates: [form], Registry: REGISTRY, ClientTools: [] });
        expect(without.Policy.Channels).toEqual([]);
        expect(without.Policy.ExcludedChannels).toEqual([{ Key: 'Form', Reason: 'opt-in-not-included' }]);

        const included = BuildSessionChannelPolicy({ Candidates: [form], ChannelsConfig: { include: ['Form'] }, Registry: REGISTRY, ClientTools: [] });
        expect(included.Policy.Channels.map((c) => c.Key)).toEqual(['Form']);
        expect(included.ClientTools?.map((t) => t.Name)).toEqual(['Form_Do']);
    });

    it('an on-demand channel is in the session but declares no native tools', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Whiteboard')],
            ChannelsConfig: { displayPolicy: { Whiteboard: 'on-demand' } },
            Registry: REGISTRY,
            ClientTools: [tool('Whiteboard_Do')],
        });
        expect(out.Policy.Channels[0]).toMatchObject({ Key: 'Whiteboard', DisplayPolicy: 'on-demand' });
        expect(out.ClientTools).toBeUndefined();
    });

    it('tools no candidate owns (the host\'s own) pass through untouched, in order, without duplicating channel tools', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Whiteboard')],
            Registry: REGISTRY,
            ClientTools: [tool('HostCustom'), tool('Whiteboard_Do')],
        });
        expect(out.ClientTools?.map((t) => t.Name)).toEqual(['HostCustom', 'Whiteboard_Do']);
    });

    it('a host-declared channel with no registry row is in the session', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Embed', { HostDeclared: true, HostConfig: { mode: 'x' } })],
            Registry: REGISTRY,
            ClientTools: [tool('Embed_Do')],
        });
        expect(out.Policy.Channels[0]).toMatchObject({ Key: 'Embed', Source: 'host', Config: { mode: 'x' } });
    });

    it('a candidate with no registry row and no host declaration is unknown, so its tools are dropped', () => {
        const out = BuildSessionChannelPolicy({ Candidates: [candidate('Rogue')], Registry: REGISTRY, ClientTools: [tool('Rogue_Do')] });
        expect(out.Policy.ExcludedChannels).toEqual([{ Key: 'Rogue', Reason: 'unknown-channel' }]);
        expect(out.ClientTools).toBeUndefined();
    });

    it('carries resolved per-channel config from the cascade, over the host\'s defaults', () => {
        const out = BuildSessionChannelPolicy({
            Candidates: [candidate('Embed', { HostDeclared: true, HostConfig: { a: 1, b: 1 } })],
            ChannelsConfig: { config: { Embed: { b: 2 } } },
            Registry: REGISTRY,
        });
        expect(out.Policy.Channels[0].Config).toEqual({ a: 1, b: 2 });
    });

    it('returns the client-tool tiers only when there are some', () => {
        const base = { Candidates: [candidate('Whiteboard')], Registry: REGISTRY };
        expect(BuildSessionChannelPolicy(base).Policy.ClientTools).toBeUndefined();
        expect(BuildSessionChannelPolicy({ ...base, ClientToolTiers: {} }).Policy.ClientTools).toBeUndefined();
        const tiers = { App: [{ Name: 'AppTool', Description: 'd', InputSchema: {} }] };
        expect(BuildSessionChannelPolicy({ ...base, ClientToolTiers: tiers }).Policy.ClientTools).toEqual(tiers);
    });
});
