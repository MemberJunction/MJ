import { describe, it, expect } from 'vitest';
import type {
    VideoAssetKind,
    VideoBeatTemplate,
    VideoInteractionMode,
    VideoPacing,
} from '@memberjunction/video-studio-core';
import type {
    MJBrandKitAssetEntity,
    MJVideoArchetypeEntity,
    MJVideoArchetypeEntity_VideoBeatTemplate,
    MJVideoArchetypeEntity_VideoPacing,
} from '@memberjunction/core-entities';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _beatTemplateSame: Same<VideoBeatTemplate, MJVideoArchetypeEntity_VideoBeatTemplate> = true;
const _beatTemplateRequiredSame: Same<
    Required<VideoBeatTemplate>,
    Required<MJVideoArchetypeEntity_VideoBeatTemplate>
> = true;

const _pacingSame: Same<VideoPacing, MJVideoArchetypeEntity_VideoPacing> = true;
const _pacingRequiredSame: Same<Required<VideoPacing>, Required<MJVideoArchetypeEntity_VideoPacing>> = true;

const _assetKindSame: Same<VideoAssetKind, MJBrandKitAssetEntity['AssetType']> = true;
const _interactionModeSame: Same<VideoInteractionMode, MJVideoArchetypeEntity['DefaultInteractionMode']> = true;

describe('JSONType and CHECK union drift guard (VS-FND-3)', () => {
    it('confirms Core types and CodeGen entity JSONTypes/unions match at compile time', () => {
        expect(_beatTemplateSame).toBe(true);
        expect(_beatTemplateRequiredSame).toBe(true);
        expect(_pacingSame).toBe(true);
        expect(_pacingRequiredSame).toBe(true);
        expect(_assetKindSame).toBe(true);
        expect(_interactionModeSame).toBe(true);
    });
});
