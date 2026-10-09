/**
 * @fileoverview Whether a realtime model shows an agent's avatar: its `MJ: AI Model Modalities` Video/Output row, and the
 * endpoint profile of the driver that serves it.
 *
 * A model shows an avatar only when both allow it:
 * 1. its Video/Output row, read from the AI engine's cache: `IsSupported` true allows video, `IsSupported` false turns it
 *    off, and no row leaves the decision to the driver;
 * 2. the driver's endpoint profile ({@link BaseRealtimeModel.SupportsAvatarOutput}): Gemini 3.8 Live renders avatars on
 *    Gemini Enterprise, not on the Gemini Developer API.
 *
 * The session prep reads the row before the mint, so a model whose row turns video off never asks its driver for an
 * avatar. The driver applies its profile at the mint, and the call's avatar status reads both.
 *
 * @module @memberjunction/ai-agents
 */

import type { BaseRealtimeModel } from '@memberjunction/ai';
import type { MJAIModalityEntity, MJAIModelModalityEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** What a model's Video/Output row says: `'supported'`, `'unsupported'` (video off), or `'unstated'` (no row). */
export type RealtimeVideoOutputRow = 'supported' | 'unsupported' | 'unstated';

/** The cached modality rows the gate reads. `AIEngine.Instance` and `AIEngineBase.Instance` provide them; tests pass a fake. */
export interface RealtimeModalitySource {
    /** Every `MJ: AI Model Modalities` row. */
    readonly ModelModalities: MJAIModelModalityEntity[];
    /** The `MJ: AI Modalities` row with this name, case-insensitive. */
    GetModalityByName(name: string): MJAIModalityEntity | undefined;
}

/** A model on the driver that would serve it: what the gate asks the driver's profile about. */
export interface RealtimeAvatarCandidate {
    /** The `MJ: AI Models` row id. */
    ModelID: string;
    /** The provider's API name for the model on this vendor. */
    APIName: string;
    /** The vendor's driver. */
    Model: BaseRealtimeModel;
}

/**
 * Reads a model's Video/Output row from the AI engine's cache. A cache that can't be read (the user may not read the
 * rows) reads as `'unstated'`, so the driver decides, as it did before the rows were read.
 *
 * @param modelID The `MJ: AI Models` row id.
 * @param source The cached modality rows.
 */
export function ReadRealtimeVideoOutputRow(modelID: string, source: RealtimeModalitySource): RealtimeVideoOutputRow {
    let row: MJAIModelModalityEntity | undefined;
    try {
        const video = source.GetModalityByName('Video');
        row = video
            ? source.ModelModalities.find((mm) => UUIDsEqual(mm.ModelID, modelID) && UUIDsEqual(mm.ModalityID, video.ID) && mm.Direction === 'Output')
            : undefined;
    } catch {
        return 'unstated';
    }
    if (!row) {
        return 'unstated';
    }
    return row.IsSupported === false ? 'unsupported' : 'supported';
}

/**
 * Whether the model shows an avatar on this driver: its Video/Output row allows video (or it has none), and the driver
 * renders avatars for the model on its endpoint.
 *
 * @param candidate The model, its API name on the vendor, and the vendor's driver.
 * @param source The cached modality rows.
 */
export function RealtimeModelShowsAvatar(candidate: RealtimeAvatarCandidate, source: RealtimeModalitySource): boolean {
    return ReadRealtimeVideoOutputRow(candidate.ModelID, source) !== 'unsupported' && candidate.Model.SupportsAvatarOutput(candidate.APIName);
}
