/**
 * @fileoverview Which live avatar, if any, a realtime session asks for, and the voice that goes with it.
 *
 * A persona is a voice and a face: its Audio binding on a vendor is a voice, its Video binding an avatar. A session asks
 * for an avatar when the voiced agent's video setting is on (`realtime.video.enabled`) and a face resolves:
 * 1. `realtime.video.avatarId`, accepted only when it names an Active Video binding the model supports on the vendor;
 * 2. else the voiced (target) agent's personas, default first, the first with a face;
 * 3. else the co-agent's personas, the same way;
 * 4. else none. The model's own first persona is never used: an agent with no persona gets no face.
 *
 * Whether the session can render the avatar is the driver's call (the model and endpoint); this only decides which one
 * to ask for. Once the driver has minted the session, {@link ResolveRealtimeAvatarStatus} merges the two into the status
 * the call gets, so a call that shows no avatar can say why.
 *
 * @module @memberjunction/ai-agents
 */

import type { RealtimeAvatarSettings, RealtimeAvatarStatus, RealtimeAvatarUnavailableReason } from '@memberjunction/ai';
import type { ResolvedAgentPersona, ResolvedModelPersona } from '@memberjunction/ai-engine-base';
import { UUIDsEqual } from '@memberjunction/global';
import type { RealtimeCoAgentConfig } from './realtime-coagent-config';

/** The persona lookups the resolution needs: `AIEngine` provides them; tests pass a fake. */
export interface RealtimeAvatarPersonaSource {
    GetModelPersonas(modelId: string, modalityName?: string, vendorId?: string): ResolvedModelPersona[];
    GetAgentPersonas(agentId: string): ResolvedAgentPersona[];
}

/** What the session needs to know to resolve its avatar. */
export interface RealtimeAvatarResolutionInput {
    /** The session's effective realtime configuration. */
    EffectiveConfig: RealtimeCoAgentConfig | null | undefined;
    /** The voiced (target) agent, when there is one. */
    TargetAgentID?: string | null;
    /** The co-agent voicing it. */
    CoAgentID: string;
    /** The resolved realtime model. */
    ModelID: string;
    /** The AI vendor serving it. Bindings on other vendors don't count. */
    VendorID?: string | null;
}

/** Which avatar to ask for, and its persona's voice; or why there is none. */
export interface RealtimeAvatarResolution {
    /** The avatar to ask for. Absent when the video setting is off or no face resolves. */
    Avatar?: RealtimeAvatarSettings;
    /** The avatar persona's voice on the same vendor, when it has one. */
    Voice?: string;
    /** Why there is no avatar although the video setting is on. */
    Reason?: Extract<RealtimeAvatarUnavailableReason, 'unknown-avatar' | 'no-binding'>;
}

/**
 * Resolves the avatar a session asks for (see the file header for the order).
 *
 * @param input The session's configuration, agents, model and vendor.
 * @param personas The persona lookups (`AIEngine.Instance`).
 */
export function ResolveRealtimeAvatar(input: RealtimeAvatarResolutionInput, personas: RealtimeAvatarPersonaSource): RealtimeAvatarResolution {
    const video = input.EffectiveConfig?.realtime?.video;
    if (video?.enabled !== true) {
        return {};
    }
    const vendorId = input.VendorID ?? undefined;
    const faces = personas.GetModelPersonas(input.ModelID, 'Video', vendorId);
    const requested = video.avatarId?.trim();
    if (requested) {
        const face = faces.find((f) => f.PersonaVendor.APIName.trim().toLowerCase() === requested.toLowerCase());
        return face ? withVoice(face, 'override', input, personas) : { Reason: 'unknown-avatar' };
    }
    for (const agentId of [input.TargetAgentID, input.CoAgentID]) {
        const face = agentId ? firstFaceOf(agentId, faces, personas) : undefined;
        if (face) {
            return withVoice(face, 'persona', input, personas);
        }
    }
    return { Reason: 'no-binding' };
}

/** The agent's first persona (the default first, then by sequence) that has a face. */
function firstFaceOf(agentId: string, faces: ResolvedModelPersona[], personas: RealtimeAvatarPersonaSource): ResolvedModelPersona | undefined {
    const agentPersonas = personas.GetAgentPersonas(agentId);
    const ordered = [...agentPersonas.filter((p) => p.AgentPersona.IsDefault), ...agentPersonas.filter((p) => !p.AgentPersona.IsDefault)];
    for (const agentPersona of ordered) {
        const face = faces.find((f) => UUIDsEqual(f.Persona.ID, agentPersona.Persona.ID));
        if (face) {
            return face;
        }
    }
    return undefined;
}

/** What a session's avatar status is made from, once the driver has minted it. */
export interface RealtimeAvatarStatusInput {
    /** The session's avatar resolution: an avatar, a reason there is none, or neither when the agent asked for none. */
    Resolution: RealtimeAvatarResolution;
    /** Whether the resolved model renders avatars on its endpoint (`BaseRealtimeModel.SupportsAvatarOutput`). */
    ModelSupportsAvatarOutput: boolean;
    /** The driver's decision at mint (`ClientRealtimeSessionConfig.AvatarStatus`), when it reported one. */
    DriverStatus?: RealtimeAvatarStatus;
}

/**
 * The status a call gets about the avatar its agent asked for. Nothing when the agent asked for none (its video
 * setting is off). Otherwise audio only with `endpoint` when the model renders no avatar on its endpoint, whatever
 * driver serves it; then the resolution's reason (`unknown-avatar`, `no-binding`); else the driver's own decision
 * (granted, or `custom-disabled` and the like).
 *
 * @param input The resolution, the model's capability and the driver's decision.
 * @returns The status for the call, or `undefined` when the session asked for no avatar or the driver reported none.
 */
export function ResolveRealtimeAvatarStatus(input: RealtimeAvatarStatusInput): RealtimeAvatarStatus | undefined {
    const { Avatar: avatar, Reason: reason } = input.Resolution;
    if (!avatar && !reason) {
        return undefined;
    }
    if (!input.ModelSupportsAvatarOutput) {
        return { Requested: true, Granted: false, Reason: 'endpoint' };
    }
    if (reason) {
        return { Requested: true, Granted: false, Reason: reason };
    }
    return input.DriverStatus;
}

/** The avatar request for a face, and the same persona's voice on the vendor. */
function withVoice(face: ResolvedModelPersona, source: 'persona' | 'override', input: RealtimeAvatarResolutionInput, personas: RealtimeAvatarPersonaSource): RealtimeAvatarResolution {
    const settings = face.PersonaVendor.VendorSettingsObject?.Avatar;
    const avatar: RealtimeAvatarSettings = {
        AvatarID: face.PersonaVendor.APIName.trim(),
        PersonaName: face.Persona.Name,
        Source: source,
        ...(settings?.Kind ? { Kind: settings.Kind } : {}),
        ...(settings?.ReferenceImageFileID ? { ReferenceImageFileID: settings.ReferenceImageFileID } : {}),
        ...(settings?.Resolution ? { Resolution: settings.Resolution } : {}),
        ...(settings?.Background ? { Background: settings.Background } : {}),
    };
    const voice = personas
        .GetModelPersonas(input.ModelID, 'Audio', input.VendorID ?? undefined)
        .find((p) => UUIDsEqual(p.Persona.ID, face.Persona.ID))?.PersonaVendor.APIName;
    return voice ? { Avatar: avatar, Voice: voice } : { Avatar: avatar };
}
