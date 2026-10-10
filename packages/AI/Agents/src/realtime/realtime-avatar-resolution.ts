/**
 * @fileoverview Which live avatar, if any, a realtime session asks for, and the voice that goes with it.
 *
 * A persona is a voice and a face: its Audio binding on a vendor is a voice, its Video binding an avatar. A session asks
 * for an avatar when the voiced agent's video setting is on (`realtime.video.enabled`), the model's Video/Output row
 * doesn't turn video off (`IsSupported` false: reason `endpoint`), and a face resolves:
 * 1. `realtime.video.avatarId`, accepted only when it names an Active Video binding the model supports on the vendor;
 * 2. else the voiced (target) agent's personas, default first, the first with a face;
 * 3. else the co-agent's personas, the same way;
 * 4. else none. The model's own first persona is never used: an agent with no persona gets no face.
 *
 * Where the session runs can rule the avatar out before any of that: nobody sees an avatar on a phone call (reason
 * `phone`), or in an app that shows no agent video (reason `host`: the app said so at mint), so such a session asks for
 * none ({@link WithoutUnseenAvatar}) and keeps only the persona's voice.
 *
 * Whether the session can render the avatar is otherwise the driver's call (its endpoint profile); this only decides
 * which one to ask for. Once the driver has minted the session, {@link ResolveRealtimeAvatarStatus} merges the two into
 * the status the call gets, so a call that shows no avatar can say why.
 *
 * @module @memberjunction/ai-agents
 */

import type { RealtimeAvatarSettings, RealtimeAvatarStatus, RealtimeAvatarUnavailableReason } from '@memberjunction/ai';
import type { ResolvedAgentPersona, ResolvedModelPersona } from '@memberjunction/ai-engine-base';
import { UUIDsEqual } from '@memberjunction/global';
import type { RealtimeCoAgentConfig } from './realtime-coagent-config';
import type { RealtimeVideoOutputRow } from './realtime-video-output-gate';

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
    /**
     * The model's Video/Output row (`ReadRealtimeVideoOutputRow`). `'unsupported'` turns video off: no avatar, reason
     * `endpoint`. `'supported'`, `'unstated'` or absent leave it to the driver's endpoint profile at the mint.
     */
    VideoOutputRow?: RealtimeVideoOutputRow;
}

/**
 * Why nobody would see an avatar in a session, whatever its model renders: `'phone'`, a phone call; `'host'`, an app that
 * shows no agent video. Such a session asks the model for none.
 */
export type RealtimeAvatarUnseenReason = Extract<RealtimeAvatarUnavailableReason, 'phone' | 'host'>;

/** Which avatar to ask for, and its persona's voice; or why there is none. */
export interface RealtimeAvatarResolution {
    /**
     * The avatar to ask for. Absent when the video setting is off, the model's row turns video off, no face resolves, or
     * nobody in the session would see it.
     */
    Avatar?: RealtimeAvatarSettings;
    /**
     * The avatar persona's voice on the same vendor, when it has one. Kept when nobody would see the avatar, so the agent
     * sounds the same on a phone call, or in an app without agent video, as in a call that shows its face.
     */
    Voice?: string;
    /**
     * Why there is no avatar although the video setting is on: nobody in the session would see it (`phone`, `host`), the
     * model's Video/Output row turns video off (`endpoint`), the requested avatar is not a face the model has on the vendor
     * (`unknown-avatar`), or no persona has one (`no-binding`).
     */
    Reason?: RealtimeAvatarUnseenReason | Extract<RealtimeAvatarUnavailableReason, 'endpoint' | 'unknown-avatar' | 'no-binding'>;
}

/** What says, before any model is asked, whether anyone in a session could see an avatar. */
export interface RealtimeAvatarViewers {
    /** `true` when the session is a phone call: the caller hears the agent and sees no video. */
    PhoneCall?: boolean;
    /**
     * `false` when the app showing the call shows no agent video (none of its channels shows it). Absent or `true`: it
     * may show it.
     */
    ShowsAgentVideo?: boolean;
}

/**
 * Why nobody would see an avatar in a session, whatever its model renders, or `undefined` when someone could. A phone
 * call says `phone` whatever app relays it.
 *
 * @param viewers What the session says about who is on the other end.
 */
export function ResolveAvatarUnseenReason(viewers: RealtimeAvatarViewers): RealtimeAvatarUnseenReason | undefined {
    if (viewers.PhoneCall === true) {
        return 'phone';
    }
    return viewers.ShowsAgentVideo === false ? 'host' : undefined;
}

/**
 * A resolution without its avatar request when nobody in the session would see the avatar
 * ({@link ResolveAvatarUnseenReason}), so the driver is never asked to render video that nobody sees. The reason replaces
 * any other, since no model or face could change it; the persona's voice stays. A resolution that asked for nothing
 * (the video setting is off) stays as it is, so the call gets no notice.
 *
 * @param resolution The session's avatar resolution.
 * @param viewers What the session says about who is on the other end.
 */
export function WithoutUnseenAvatar(resolution: RealtimeAvatarResolution, viewers: RealtimeAvatarViewers): RealtimeAvatarResolution {
    const unseen = ResolveAvatarUnseenReason(viewers);
    if (!unseen || (!resolution.Avatar && !resolution.Reason)) {
        return resolution;
    }
    return resolution.Voice ? { Voice: resolution.Voice, Reason: unseen } : { Reason: unseen };
}

/**
 * The status a server-side session reports when its prep asked the driver for no avatar because nobody would see it
 * (`phone`, `host`): asked for, not granted, and why. Otherwise the driver's own status.
 *
 * @param resolution The session's avatar resolution.
 * @param driverStatus What the driver reported when it opened the session (`IRealtimeSession.AvatarStatus`).
 */
export function ResolveUnseenAvatarStatus(resolution: RealtimeAvatarResolution | undefined, driverStatus: RealtimeAvatarStatus | undefined): RealtimeAvatarStatus | undefined {
    const reason = resolution?.Reason;
    return reason && isUnseenReason(reason) ? { Requested: true, Granted: false, Reason: reason } : driverStatus;
}

/** Whether a resolution's reason says nobody in the session would see the avatar. */
function isUnseenReason(reason: NonNullable<RealtimeAvatarResolution['Reason']>): reason is RealtimeAvatarUnseenReason {
    return reason === 'phone' || reason === 'host';
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
    if (input.VideoOutputRow === 'unsupported') {
        return { Reason: 'endpoint' };
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
    /**
     * Whether the resolved model shows avatars (`RealtimeModelShowsAvatar`): its Video/Output row allows video or it has
     * none, and its driver renders avatars on its endpoint (`BaseRealtimeModel.SupportsAvatarOutput`).
     */
    ModelSupportsAvatarOutput: boolean;
    /** The driver's decision at mint (`ClientRealtimeSessionConfig.AvatarStatus`), when it reported one. */
    DriverStatus?: RealtimeAvatarStatus;
}

/**
 * The status a call gets about the avatar its agent asked for. Nothing when the agent asked for none (its video
 * setting is off). Otherwise audio only when nobody in the session would see it ({@link RealtimeAvatarUnseenReason}),
 * whatever the model renders; then `endpoint` when the model shows no avatar (its Video/Output row turns video off, or it
 * renders none on its endpoint), whatever driver serves it; then the resolution's reason (`unknown-avatar`,
 * `no-binding`); else the driver's own decision (granted, or `custom-disabled` and the like).
 *
 * @param input The resolution, the model's capability and the driver's decision.
 * @returns The status for the call, or `undefined` when the session asked for no avatar or the driver reported none.
 */
export function ResolveRealtimeAvatarStatus(input: RealtimeAvatarStatusInput): RealtimeAvatarStatus | undefined {
    const { Avatar: avatar, Reason: reason } = input.Resolution;
    if (!avatar && !reason) {
        return undefined;
    }
    if (reason && isUnseenReason(reason)) {
        return { Requested: true, Granted: false, Reason: reason };
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
