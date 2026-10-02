import { describe, it, expect } from 'vitest';
import {
    BuildChannelCandidate,
    FindPreparedChannel,
    MergeToolMetadata,
    ReconcileChannelsWithPolicy,
    ResolveLocalChannelScope,
    ToolsByChannelKey,
    type PreparedChannel,
} from '../session/channel-session-scope';
import { BuildToolBackedVerbs, SynthesizeChannelDescriptor, VerbNameForTool } from '../channels/channel-descriptor-synthesis';
import { FormChannel, LegacyEchoChannel } from './channel-test-helpers';

function prepared(plugin: LegacyEchoChannel | FormChannel, registry: PreparedChannel['Registry'], extra: Partial<PreparedChannel> = {}): PreparedChannel {
    return { Plugin: plugin, Key: plugin.ChannelName, Registry: registry, ...extra };
}

describe('BuildChannelCandidate / ResolveLocalChannelScope', () => {
    it('reports descriptor facts, tools and registry state, and marks host declarations', () => {
        const p = prepared(new LegacyEchoChannel(), 'none', { HostDeclaration: { Config: { a: 1 }, DisplayPolicy: 'on-demand' } });
        const c = BuildChannelCandidate(p, p.Plugin.GetDescriptor());
        expect(c).toMatchObject({
            Key: 'Echo',
            DefaultAvailability: 'all-sessions',
            ToolNamePrefix: 'Echo_',
            Registry: 'none',
            HostDeclared: true,
            HostConfig: { a: 1 },
            HostDisplayPolicy: 'on-demand',
        });
        expect(c.Tools.map((t) => t.Name)).toEqual(['Echo_Say']);
    });

    it('resolves the local scope: all-sessions in, opt-in out, kill switch and unknown out', () => {
        const echo = prepared(new LegacyEchoChannel(), 'active');
        const form = prepared(new FormChannel(), 'active');
        const scope = ResolveLocalChannelScope([echo, form].map((p) => BuildChannelCandidate(p, p.Plugin.GetDescriptor())));
        expect(scope.Channels.map((c) => c.Key)).toEqual(['Echo']);
        expect(scope.Excluded).toEqual([{ Key: 'Form', Reason: 'opt-in-not-included' }]);

        const killed = ResolveLocalChannelScope([BuildChannelCandidate(prepared(new LegacyEchoChannel(), 'inactive'), new LegacyEchoChannel().GetDescriptor())]);
        expect(killed.Excluded[0].Reason).toBe('inactive-registry-row');
        const unknown = ResolveLocalChannelScope([BuildChannelCandidate(prepared(new LegacyEchoChannel(), 'none'), new LegacyEchoChannel().GetDescriptor())]);
        expect(unknown.Excluded[0].Reason).toBe('unknown-channel');
    });

    it('ToolsByChannelKey indexes each candidate\'s tools', () => {
        const p = prepared(new LegacyEchoChannel(), 'active');
        const map = ToolsByChannelKey([BuildChannelCandidate(p, p.Plugin.GetDescriptor())]);
        expect(map.get('Echo')?.[0].Name).toBe('Echo_Say');
    });
});

describe('ReconcileChannelsWithPolicy', () => {
    it('maps policy channels onto prepared plugins in policy order, case-insensitively', () => {
        const echo = prepared(new LegacyEchoChannel(), 'active');
        const form = prepared(new FormChannel(), 'active');
        const r = ReconcileChannelsWithPolicy(
            [echo, form],
            [
                { Key: 'FORM', DisplayPolicy: 'on-demand', MaxExposure: 'state', Source: 'config' },
                { Key: 'echo', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' },
            ],
        );
        expect(r.InSession.map((c) => c.Prepared.Key)).toEqual(['Form', 'Echo']);
        expect(r.Dropped).toEqual([]);
    });

    it('drops prepared plugins the policy left out and reports policy keys with no plugin', () => {
        const echo = prepared(new LegacyEchoChannel(), 'active');
        const form = prepared(new FormChannel(), 'active');
        const r = ReconcileChannelsWithPolicy([echo, form], [{ Key: 'Echo', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' }, { Key: 'Ghost', DisplayPolicy: 'headless', MaxExposure: 'none', Source: 'default' }]);
        expect(r.Dropped).toEqual([form]);
        expect(r.Unknown).toEqual(['Ghost']);
    });

    it('never mounts one plugin twice for a duplicated policy key', () => {
        const echo = prepared(new LegacyEchoChannel(), 'active');
        const r = ReconcileChannelsWithPolicy([echo], [
            { Key: 'Echo', DisplayPolicy: 'open-on-start', MaxExposure: 'state', Source: 'default' },
            { Key: 'echo', DisplayPolicy: 'headless', MaxExposure: 'state', Source: 'config' },
        ]);
        expect(r.InSession).toHaveLength(1);
    });

    it('FindPreparedChannel is case-insensitive', () => {
        const echo = prepared(new LegacyEchoChannel(), 'active');
        expect(FindPreparedChannel([echo], 'ECHO')).toBe(echo);
        expect(FindPreparedChannel([echo], 'x')).toBeUndefined();
    });
});

describe('MergeToolMetadata', () => {
    it('lets a bare registration inherit the manifest description and schema', () => {
        const merged = MergeToolMetadata(
            [{ Name: 'Go', Description: '', InputSchema: {} }],
            [{ Name: 'go', Description: 'Navigate', InputSchema: { type: 'object' } }],
        );
        expect(merged[0]).toMatchObject({ Name: 'Go', Description: 'Navigate', InputSchema: { type: 'object' } });
    });

    it('keeps a registration\'s own metadata over the manifest\'s and passes unmatched tools through', () => {
        const merged = MergeToolMetadata(
            [{ Name: 'Go', Description: 'mine', InputSchema: { type: 'string' } }, { Name: 'Solo', Description: 'solo', InputSchema: {} }],
            [{ Name: 'Go', Description: 'theirs', InputSchema: { type: 'object' } }],
        );
        expect(merged[0]).toMatchObject({ Description: 'mine', InputSchema: { type: 'string' } });
        expect(merged[1].Name).toBe('Solo');
    });
});

describe('descriptor synthesis', () => {
    it('VerbNameForTool strips the shared prefix, but never reduces a name to nothing', () => {
        expect(VerbNameForTool('Whiteboard_AddNote', 'Whiteboard_')).toBe('AddNote');
        expect(VerbNameForTool('Whiteboard_', 'Whiteboard_')).toBe('Whiteboard_');
        expect(VerbNameForTool('ContextTool', 'ContextTool')).toBe('ContextTool');
        expect(VerbNameForTool('Other', '')).toBe('Other');
    });

    it('BuildToolBackedVerbs keeps the native tool name and defaults to agent-invokable', () => {
        const verbs = BuildToolBackedVerbs(new LegacyEchoChannel().GetToolDefinitions(), 'Echo_');
        expect(verbs).toEqual([expect.objectContaining({ Name: 'Say', NativeToolName: 'Echo_Say', InvokableBy: 'agent' })]);
    });

    it('instructions prefer the registry description, then the onboarding intro, then the prefix', () => {
        const echo = new LegacyEchoChannel();
        expect(SynthesizeChannelDescriptor(echo, { RegistryDescription: 'From the registry' }).Instructions).toBe('From the registry');
        expect(SynthesizeChannelDescriptor(echo).Instructions).toContain('"Echo_"');
    });
});
