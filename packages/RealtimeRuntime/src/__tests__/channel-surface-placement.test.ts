import { describe, it, expect } from 'vitest';
import type { MJAIAgentChannelEntity_IChannelUIConfig } from '@memberjunction/core-entities';
import { DEFAULT_CHANNEL_SURFACE_PLACEMENT, ReadChannelSurfacePlacement } from '../channels/channel-surface-placement';

const ANYWHERE = ['stage', 'pip', 'tab', 'hidden'];

/** A row's UIConfig as it might be stored: hand-edited JSON, so it may hold values the type does not allow. */
function stored(json: string): MJAIAgentChannelEntity_IChannelUIConfig {
    return JSON.parse(json) as MJAIAgentChannelEntity_IChannelUIConfig;
}

describe('ReadChannelSurfacePlacement', () => {
    it('puts a channel without a UIConfig, or one that says nothing about placement, on its tab and lets it go anywhere', () => {
        expect(ReadChannelSurfacePlacement(null)).toEqual({ Default: 'tab', Allowed: ANYWHERE });
        expect(ReadChannelSurfacePlacement({ DisplayName: 'Board', Placement: null, AllowedPlacements: null })).toEqual({ Default: 'tab', Allowed: ANYWHERE });
        expect(DEFAULT_CHANNEL_SURFACE_PLACEMENT).toEqual({ Default: 'tab', Allowed: ANYWHERE });
    });

    it('reads the placement and the placements it allows', () => {
        expect(ReadChannelSurfacePlacement({ Placement: 'pip', AllowedPlacements: ['pip', 'stage', 'hidden'] })).toEqual({
            Default: 'pip',
            Allowed: ['pip', 'stage', 'hidden'],
        });
        expect(ReadChannelSurfacePlacement({ Placement: 'stage' })).toEqual({ Default: 'stage', Allowed: ANYWHERE });
    });

    it('gives a placement the list does not allow way to the first placement listed', () => {
        expect(ReadChannelSurfacePlacement({ Placement: 'stage', AllowedPlacements: ['tab', 'hidden'] })).toEqual({ Default: 'tab', Allowed: ['tab', 'hidden'] });
        expect(ReadChannelSurfacePlacement({ AllowedPlacements: ['pip'] })).toEqual({ Default: 'pip', Allowed: ['pip'] });
    });

    it('ignores what is not a placement, and repeats', () => {
        expect(ReadChannelSurfacePlacement(stored('{"Placement":"floating","AllowedPlacements":["sidebar","pip",3,"pip","tab"]}'))).toEqual({
            Default: 'tab',
            Allowed: ['pip', 'tab'],
        });
        expect(ReadChannelSurfacePlacement(stored('{"Placement":"floating","AllowedPlacements":["pip","hidden"]}'))).toEqual({
            Default: 'pip',
            Allowed: ['pip', 'hidden'],
        });
        expect(ReadChannelSurfacePlacement(stored('{"Placement":"pip","AllowedPlacements":"pip"}'))).toEqual({ Default: 'pip', Allowed: ANYWHERE });
        expect(ReadChannelSurfacePlacement(stored('{"Placement":"pip","AllowedPlacements":[]}'))).toEqual({ Default: 'pip', Allowed: ANYWHERE });
    });
});
