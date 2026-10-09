/**
 * Which live avatar a realtime session asks for: the voiced agent's persona face when its video setting is on, then the
 * co-agent's, never the model's own first persona; an explicit avatar id only when it names a real binding; the avatar
 * persona's voice to go with it; and none when the model's Video/Output row turns video off.
 */
import { describe, it, expect } from 'vitest';
import type { ResolvedAgentPersona, ResolvedModelPersona } from '@memberjunction/ai-engine-base';
import type { MJAIAgentPersonaEntity, MJAIPersonaEntity, MJAIPersonaVendorEntity } from '@memberjunction/core-entities';
import { ResolveRealtimeAvatar, ResolveRealtimeAvatarStatus, type RealtimeAvatarPersonaSource } from '../realtime/realtime-avatar-resolution';
import { BuildRealtimeOverridesJson, ResolveEffectiveRealtimeConfig, type RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

const MODEL = 'model-38-live';
const VERTEX = 'vendor-vertex';

function persona(id: string, name: string): MJAIPersonaEntity {
    return { ID: id, Name: name } as unknown as MJAIPersonaEntity;
}

function binding(apiName: string, avatar?: { Kind?: 'preset' | 'custom'; Resolution?: 'low' | 'standard' | 'high' }): MJAIPersonaVendorEntity {
    return { APIName: apiName, VendorSettingsObject: avatar ? { Avatar: avatar } : null } as unknown as MJAIPersonaVendorEntity;
}

/** A fake persona source: faces (Video) and voices (Audio) per vendor, and each agent's personas. */
class FakePersonas implements RealtimeAvatarPersonaSource {
    public Faces: ResolvedModelPersona[] = [];
    public Voices: ResolvedModelPersona[] = [];
    public Agents: Record<string, ResolvedAgentPersona[]> = {};
    public VendorsAsked: Array<string | undefined> = [];

    public GetModelPersonas(modelId: string, modalityName = 'Audio', vendorId?: string): ResolvedModelPersona[] {
        this.VendorsAsked.push(vendorId);
        if (modelId !== MODEL) {
            return [];
        }
        return modalityName === 'Video' ? this.Faces : this.Voices;
    }

    public GetAgentPersonas(agentId: string): ResolvedAgentPersona[] {
        return this.Agents[agentId] ?? [];
    }
}

function agentPersona(p: MJAIPersonaEntity, isDefault = false): ResolvedAgentPersona {
    return { Persona: p, AgentPersona: { IsDefault: isDefault } as unknown as MJAIAgentPersonaEntity };
}

const BEN = persona('p-ben', 'Ben');
const KAI = persona('p-kai', 'Kai');
const VIDEO_ON: RealtimeCoAgentConfig = { realtime: { video: { enabled: true } } };

function source(): FakePersonas {
    const s = new FakePersonas();
    s.Faces = [
        { Persona: BEN, PersonaVendor: binding('Ben', { Kind: 'preset', Resolution: 'standard' }) },
        { Persona: KAI, PersonaVendor: binding('Kai') },
    ];
    s.Voices = [{ Persona: BEN, PersonaVendor: binding('Puck') }];
    return s;
}

describe('ResolveRealtimeAvatar', () => {
    it("asks for nothing while the agent's video setting is off, and reads no persona", () => {
        const s = source();
        s.Agents['target'] = [agentPersona(BEN, true)];
        for (const cfg of [{}, { realtime: { video: { enabled: false } } }, null] as Array<RealtimeCoAgentConfig | null>) {
            expect(ResolveRealtimeAvatar({ EffectiveConfig: cfg, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL, VendorID: VERTEX }, s)).toEqual({});
        }
        expect(s.VendorsAsked).toEqual([]);
    });

    it("uses the voiced agent's persona face, its settings, and the same persona's voice on the vendor", () => {
        const s = source();
        s.Agents['target'] = [agentPersona(BEN, true)];
        const result = ResolveRealtimeAvatar({ EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL, VendorID: VERTEX }, s);
        expect(result).toEqual({
            Avatar: { AvatarID: 'Ben', PersonaName: 'Ben', Source: 'persona', Kind: 'preset', Resolution: 'standard' },
            Voice: 'Puck',
        });
        expect(new Set(s.VendorsAsked)).toEqual(new Set([VERTEX]));
    });

    it("prefers the agent's default persona, then its others in order, skipping personas without a face", () => {
        const s = source();
        const nobody = persona('p-none', 'No face');
        s.Agents['target'] = [agentPersona(BEN), agentPersona(nobody), agentPersona(KAI, true)];
        expect(ResolveRealtimeAvatar({ EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, s).Avatar?.AvatarID).toBe('Kai');
        s.Agents['target'] = [agentPersona(nobody, true), agentPersona(BEN)];
        expect(ResolveRealtimeAvatar({ EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, s).Avatar?.AvatarID).toBe('Ben');
    });

    it("falls back to the co-agent's persona face when the voiced agent has none", () => {
        const s = source();
        s.Agents['co'] = [agentPersona(KAI, true)];
        const result = ResolveRealtimeAvatar({ EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, s);
        expect(result.Avatar).toEqual({ AvatarID: 'Kai', PersonaName: 'Kai', Source: 'persona' });
        expect(result.Voice).toBeUndefined();
    });

    it("prefers the voiced agent's face over the co-agent's", () => {
        const s = source();
        s.Agents['target'] = [agentPersona(KAI, true)];
        s.Agents['co'] = [agentPersona(BEN, true)];
        expect(ResolveRealtimeAvatar({ EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, s).Avatar?.AvatarID).toBe('Kai');
    });

    it("never uses the model's own first persona: no agent persona means no face", () => {
        const result = ResolveRealtimeAvatar({ EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, source());
        expect(result).toEqual({ Reason: 'no-binding' });
    });

    it('takes realtime.video.avatarId only when it names a face the model has on the vendor', () => {
        const s = source();
        s.Agents['target'] = [agentPersona(BEN, true)];
        const picked = ResolveRealtimeAvatar(
            { EffectiveConfig: { realtime: { video: { enabled: true, avatarId: ' kai ' } } }, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, s);
        expect(picked.Avatar).toEqual({ AvatarID: 'Kai', PersonaName: 'Kai', Source: 'override' });

        const unknown = ResolveRealtimeAvatar(
            { EffectiveConfig: { realtime: { video: { enabled: true, avatarId: 'Nobody' } } }, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL }, s);
        expect(unknown).toEqual({ Reason: 'unknown-avatar' });
    });

    it("asks for no avatar when the model's Video/Output row turns video off: reason endpoint, and no persona is read", () => {
        const s = source();
        s.Agents['target'] = [agentPersona(BEN, true)];
        const result = ResolveRealtimeAvatar(
            { EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL, VendorID: VERTEX, VideoOutputRow: 'unsupported' }, s);
        expect(result).toEqual({ Reason: 'endpoint' });
        expect(s.VendorsAsked).toEqual([]);
    });

    it("gives no reason for a turned-off row while the agent's video setting is off", () => {
        expect(ResolveRealtimeAvatar(
            { EffectiveConfig: { realtime: { video: { enabled: false } } }, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL, VideoOutputRow: 'unsupported' },
            source(),
        )).toEqual({});
    });

    it("resolves the persona's face when the row allows video, or the model has none (the driver decides then)", () => {
        for (const row of ['supported', 'unstated'] as const) {
            const s = source();
            s.Agents['target'] = [agentPersona(BEN, true)];
            const result = ResolveRealtimeAvatar(
                { EffectiveConfig: VIDEO_ON, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL, VendorID: VERTEX, VideoOutputRow: row }, s);
            expect(result.Avatar?.AvatarID).toBe('Ben');
        }
    });

    it("asks for the avatar a picker override names, even when the voiced agent's video setting is off", () => {
        // The picker's override (voice + the avatar that comes with it) is the top layer of the effective config.
        const target = JSON.stringify({ realtime: { video: { enabled: false } } });
        const effective = ResolveEffectiveRealtimeConfig(null, null, BuildRealtimeOverridesJson(MODEL, 'Puck', 'Ben'), target);
        const result = ResolveRealtimeAvatar({ EffectiveConfig: effective, TargetAgentID: 'target', CoAgentID: 'co', ModelID: MODEL, VendorID: VERTEX }, source());
        expect(result.Avatar).toEqual({ AvatarID: 'Ben', PersonaName: 'Ben', Source: 'override', Kind: 'preset', Resolution: 'standard' });
    });
});

describe('ResolveRealtimeAvatarStatus', () => {
    const BEN = { AvatarID: 'Ben', PersonaName: 'Ben', Source: 'persona' as const };

    it('says nothing when the session asked for no avatar, whatever the model and driver say', () => {
        expect(ResolveRealtimeAvatarStatus({ Resolution: {}, ModelSupportsAvatarOutput: true, DriverStatus: { Requested: true, Granted: true } })).toBeUndefined();
        expect(ResolveRealtimeAvatarStatus({ Resolution: {}, ModelSupportsAvatarOutput: false })).toBeUndefined();
    });

    it('says the voice model shows none when the model renders no avatar, before the persona reasons', () => {
        const endpoint = { Requested: true, Granted: false, Reason: 'endpoint' };
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Avatar: BEN }, ModelSupportsAvatarOutput: false })).toEqual(endpoint);
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Reason: 'no-binding' }, ModelSupportsAvatarOutput: false })).toEqual(endpoint);
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Reason: 'unknown-avatar' }, ModelSupportsAvatarOutput: false })).toEqual(endpoint);
    });

    it("says the voice model shows none when the model's Video/Output row turned video off at the prep", () => {
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Reason: 'endpoint' }, ModelSupportsAvatarOutput: false, DriverStatus: { Requested: true, Granted: true } }))
            .toEqual({ Requested: true, Granted: false, Reason: 'endpoint' });
    });

    it("gives the resolution's reason when the model renders avatars but no face resolved, never the driver's status", () => {
        const granted = { Requested: true, Granted: true };
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Reason: 'no-binding' }, ModelSupportsAvatarOutput: true, DriverStatus: granted }))
            .toEqual({ Requested: true, Granted: false, Reason: 'no-binding' });
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Reason: 'unknown-avatar' }, ModelSupportsAvatarOutput: true }))
            .toEqual({ Requested: true, Granted: false, Reason: 'unknown-avatar' });
    });

    it("passes the driver's decision through when a face resolved on a model that renders avatars", () => {
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Avatar: BEN }, ModelSupportsAvatarOutput: true, DriverStatus: { Requested: true, Granted: true } }))
            .toEqual({ Requested: true, Granted: true });
        expect(ResolveRealtimeAvatarStatus({
            Resolution: { Avatar: { ...BEN, Kind: 'custom' } },
            ModelSupportsAvatarOutput: true,
            DriverStatus: { Requested: true, Granted: false, Reason: 'custom-disabled' },
        })).toEqual({ Requested: true, Granted: false, Reason: 'custom-disabled' });
        expect(ResolveRealtimeAvatarStatus({ Resolution: { Avatar: BEN }, ModelSupportsAvatarOutput: true })).toBeUndefined();
    });
});
