/**
 * Whether a realtime model shows an avatar: its `MJ: AI Model Modalities` Video/Output row (supported, turned off, or
 * absent) and its driver's endpoint profile, both required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseRealtimeModel } from '@memberjunction/ai';
import type { MJAIModalityEntity, MJAIModelModalityEntity } from '@memberjunction/core-entities';
import { ReadRealtimeVideoOutputRow, RealtimeModelShowsAvatar, type RealtimeModalitySource } from '../realtime/realtime-video-output-gate';

const MODEL = 'C5650EB0-9394-4800-B514-462272FF4011';
const OTHER_MODEL = 'model-other';
const VIDEO = 'modality-video';
const AUDIO = 'modality-audio';

function row(modelID: string, modalityID: string, direction: 'Input' | 'Output', isSupported: boolean): MJAIModelModalityEntity {
    return { ModelID: modelID, ModalityID: modalityID, Direction: direction, IsSupported: isSupported } as unknown as MJAIModelModalityEntity;
}

/** A modality source with the given rows; `Video` and `Audio` exist unless left out. */
function source(rows: MJAIModelModalityEntity[], modalities: Record<string, string> = { video: VIDEO, audio: AUDIO }): RealtimeModalitySource {
    return {
        ModelModalities: rows,
        GetModalityByName: (name: string) => {
            const id = modalities[name.toLowerCase()];
            return id ? ({ ID: id, Name: name } as unknown as MJAIModalityEntity) : undefined;
        },
    };
}

/** A driver whose endpoint renders avatars for the given API names. */
function driver(rendersFor: string[]): BaseRealtimeModel & { Asked: string[] } {
    const asked: string[] = [];
    return {
        Asked: asked,
        SupportsAvatarOutput: (apiName: string) => {
            asked.push(apiName);
            return rendersFor.includes(apiName);
        },
    } as unknown as BaseRealtimeModel & { Asked: string[] };
}

describe('ReadRealtimeVideoOutputRow', () => {
    it("reads 'supported' from an IsSupported row and 'unsupported' from a turned-off one", () => {
        expect(ReadRealtimeVideoOutputRow(MODEL, source([row(MODEL, VIDEO, 'Output', true)]))).toBe('supported');
        expect(ReadRealtimeVideoOutputRow(MODEL, source([row(MODEL, VIDEO, 'Output', false)]))).toBe('unsupported');
    });

    it("reads 'unstated' when the model has no Video/Output row", () => {
        expect(ReadRealtimeVideoOutputRow(MODEL, source([]))).toBe('unstated');
    });

    it('counts only the Video modality, the Output direction, and this model', () => {
        const others = [
            row(MODEL, VIDEO, 'Input', false),
            row(MODEL, AUDIO, 'Output', false),
            row(OTHER_MODEL, VIDEO, 'Output', false),
        ];
        expect(ReadRealtimeVideoOutputRow(MODEL, source(others))).toBe('unstated');
        expect(ReadRealtimeVideoOutputRow(MODEL, source([...others, row(MODEL, VIDEO, 'Output', true)]))).toBe('supported');
    });

    it('matches the model id whatever its case', () => {
        expect(ReadRealtimeVideoOutputRow(MODEL.toLowerCase(), source([row(MODEL, VIDEO, 'Output', false)]))).toBe('unsupported');
    });

    it("reads 'unstated' when there is no Video modality, or the cache can't be read", () => {
        expect(ReadRealtimeVideoOutputRow(MODEL, source([row(MODEL, VIDEO, 'Output', false)], { audio: AUDIO }))).toBe('unstated');
        const denied: RealtimeModalitySource = {
            get ModelModalities(): MJAIModelModalityEntity[] {
                throw new Error('permission denied');
            },
            GetModalityByName: () => ({ ID: VIDEO, Name: 'Video' }) as unknown as MJAIModalityEntity,
        };
        expect(ReadRealtimeVideoOutputRow(MODEL, denied)).toBe('unstated');
    });
});

describe('RealtimeModelShowsAvatar', () => {
    const candidate = (rows: MJAIModelModalityEntity[], rendersFor: string[]) => ({
        Source: source(rows),
        Driver: driver(rendersFor),
    });

    it('shows one only when the row allows video and the endpoint renders avatars for the API name', () => {
        const { Source, Driver } = candidate([row(MODEL, VIDEO, 'Output', true)], ['gemini-3.8-live']);
        expect(RealtimeModelShowsAvatar({ ModelID: MODEL, APIName: 'gemini-3.8-live', Model: Driver }, Source)).toBe(true);
        expect(Driver.Asked).toEqual(['gemini-3.8-live']);
    });

    it("shows none when the row allows video but the endpoint renders no avatar (Gemini 3.8 Live on the Developer API)", () => {
        const { Source, Driver } = candidate([row(MODEL, VIDEO, 'Output', true)], []);
        expect(RealtimeModelShowsAvatar({ ModelID: MODEL, APIName: 'gemini-3.8-live', Model: Driver }, Source)).toBe(false);
    });

    it("shows none when the row turns video off, whatever the endpoint renders, and doesn't ask the driver", () => {
        const { Source, Driver } = candidate([row(MODEL, VIDEO, 'Output', false)], ['gemini-3.8-live']);
        expect(RealtimeModelShowsAvatar({ ModelID: MODEL, APIName: 'gemini-3.8-live', Model: Driver }, Source)).toBe(false);
        expect(Driver.Asked).toEqual([]);
    });

    it('leaves it to the endpoint when the model has no row', () => {
        const renders = candidate([], ['gemini-3.8-live']);
        expect(RealtimeModelShowsAvatar({ ModelID: MODEL, APIName: 'gemini-3.8-live', Model: renders.Driver }, renders.Source)).toBe(true);
        const none = candidate([], []);
        expect(RealtimeModelShowsAvatar({ ModelID: MODEL, APIName: 'gemini-3.8-live', Model: none.Driver }, none.Source)).toBe(false);
    });

    it('asks the driver about the vendor API name it was given', () => {
        const spy = vi.fn(() => false);
        RealtimeModelShowsAvatar({ ModelID: MODEL, APIName: 'gemini-3.8-live-001', Model: { SupportsAvatarOutput: spy } as unknown as BaseRealtimeModel }, source([]));
        expect(spy).toHaveBeenCalledWith('gemini-3.8-live-001');
    });
});
