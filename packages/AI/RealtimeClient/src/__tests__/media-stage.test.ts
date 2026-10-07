import { describe, it, expect } from 'vitest';
import {
    LayoutMediaStage,
    PlacementOffStage,
    ResolveSurfacePlacements,
    SelectDisplayParticipants,
    SelectScreenSharer,
    SelectSplitSpeaker,
    SelectSpotlight,
} from '../media/mediaStage';
import type { MediaParticipant, MediaPlacementMove, MediaSurface, MediaVideoSource } from '../media/model';

const STREAM: MediaVideoSource = { Kind: 'element', Attach: () => () => undefined };

function person(identity: string, overrides: Partial<MediaParticipant> = {}): MediaParticipant {
    return { Identity: identity, DisplayName: identity, Role: 'participant', IsSpeaking: false, Video: {}, ...overrides };
}

const ME = person('me', { Role: 'self' });

function surface(key: string, defaultPlacement: MediaSurface['DefaultPlacement'], extra: Partial<MediaSurface> = {}): MediaSurface {
    return { Key: key, Label: key, DefaultPlacement: defaultPlacement, ...extra };
}

function moved(surfaceKey: string, placement: MediaPlacementMove['Placement']): MediaPlacementMove {
    return { SurfaceKey: surfaceKey, Placement: placement };
}

const keys = (list: readonly { Key: string }[]): string[] => list.map((s) => s.Key);
const ids = (list: readonly MediaParticipant[]): string[] => list.map((p) => p.Identity);

// Ported from livekit-room-logic.test.ts in ng-livekit-room; each keeps its meaning on MediaParticipant.
describe('participant selection (ported from the LiveKit room)', () => {
    describe('SelectDisplayParticipants', () => {
        it('puts the user first when the self-view is shown', () => {
            expect(ids(SelectDisplayParticipants([person('r1'), ME], true))).toEqual(['me', 'r1']);
        });
        it('leaves the user out when the self-view is hidden', () => {
            expect(ids(SelectDisplayParticipants([ME, person('r1')], false))).toEqual(['r1']);
        });
    });

    describe('SelectSpotlight', () => {
        it('prefers a pinned participant', () => {
            expect(SelectSpotlight([ME, person('a'), person('b')], [], 'b')?.Identity).toBe('b');
        });
        it('without a pin falls to the agent', () => {
            expect(SelectSpotlight([person('a', { Role: 'agent' }), person('b')], [], null)?.Identity).toBe('a');
        });
        it('takes the active speaker other than the user', () => {
            expect(SelectSpotlight([ME, person('a'), person('b')], ['me', 'b'], null)?.Identity).toBe('b');
        });
        it('falls back to the agent, then the first other participant, then the user', () => {
            expect(SelectSpotlight([person('a'), person('bot', { Role: 'agent' })], [], null)?.Identity).toBe('bot');
            expect(SelectSpotlight([person('a')], [], null)?.Identity).toBe('a');
            expect(SelectSpotlight([ME], [], null)?.Identity).toBe('me');
            expect(SelectSpotlight([], [], null)).toBeNull();
        });
        it('features a speaking agent the active-speaker list misses', () => {
            const participants = [ME, person('human'), person('bot', { Role: 'agent', IsSpeaking: true })];
            expect(SelectSpotlight(participants, [], null)?.Identity).toBe('bot');
        });
    });

    describe('SelectScreenSharer', () => {
        it('returns the first participant sharing a screen', () => {
            const participants = [person('a'), person('b', { Video: { screen: STREAM } }), person('c', { Video: { screen: STREAM } })];
            expect(SelectScreenSharer(participants)?.Identity).toBe('b');
        });
        it('returns null when nobody is sharing', () => {
            expect(SelectScreenSharer([person('a')])).toBeNull();
        });
    });

    describe('SelectSplitSpeaker', () => {
        it('picks the active speaker that is not the sharer', () => {
            const participants = [person('sharer', { Video: { screen: STREAM } }), person('talker')];
            expect(SelectSplitSpeaker(participants, ['sharer', 'talker'])?.Identity).toBe('talker');
        });
        it('falls back to the agent when there is no distinct speaker', () => {
            const participants = [person('sharer', { Video: { screen: STREAM } }), person('bot', { Role: 'agent' })];
            expect(SelectSplitSpeaker(participants, [])?.Identity).toBe('bot');
        });
    });

    it('the filmstrip leaves out the spotlight participant (was SelectFilmstrip)', () => {
        const layout = LayoutMediaStage({ Participants: [person('a'), person('b'), person('c')], ActiveSpeakers: ['b'] });
        expect(layout.Stage).toEqual({ Kind: 'participant', Participant: expect.objectContaining({ Identity: 'b' }) });
        expect(ids(layout.Others)).toEqual(['a', 'c']);
    });
});

// Cases the LiveKit tests miss: each fails if its rule is removed.
describe('participant selection (beyond the LiveKit tests)', () => {
    it('the spotlight takes a speaking participant the active-speaker list misses over the agent', () => {
        const participants = [ME, person('human', { IsSpeaking: true }), person('bot', { Role: 'agent' })];
        expect(SelectSpotlight(participants, [], null)?.Identity).toBe('human');
    });

    it('the spotlight skips an active speaker who has left the session', () => {
        expect(SelectSpotlight([ME, person('a'), person('b')], ['gone', 'b'], null)?.Identity).toBe('b');
    });

    it('the split speaker takes a speaking participant the list misses, but never the sharer', () => {
        const participants = [person('sharer', { Video: { screen: STREAM }, IsSpeaking: true }), person('bot', { Role: 'agent' }), person('talker', { IsSpeaking: true })];
        expect(SelectSplitSpeaker(participants, [])?.Identity).toBe('talker');
    });

    it('the split speaker skips an active speaker who has left the session', () => {
        const participants = [person('sharer', { Video: { screen: STREAM } }), person('a'), person('talker')];
        expect(SelectSplitSpeaker(participants, ['gone', 'talker'])?.Identity).toBe('talker');
    });
});

describe('surface placement', () => {
    const avatar = surface('avatar', 'stage', { Video: { ParticipantIdentity: 'bot', Kind: 'avatar' } });
    const camera = surface('camera', 'pip', { Video: { ParticipantIdentity: 'me', Kind: 'camera' } });
    const screen = surface('screen', 'pip', { Video: { ParticipantIdentity: 'me', Kind: 'screen' } });
    const whiteboard = surface('whiteboard', 'tab');
    const browser = surface('browser', 'tab');

    it('puts each surface at its default with no moves', () => {
        const placed = ResolveSurfacePlacements([avatar, camera, whiteboard], []);
        expect(placed.Stage?.Key).toBe('avatar');
        expect(keys(placed.Pips)).toEqual(['camera']);
        expect(keys(placed.Tabs)).toEqual(['whiteboard']);
    });

    it("follows the user's latest move for each surface", () => {
        const placed = ResolveSurfacePlacements([whiteboard, browser], [moved('whiteboard', 'pip'), moved('browser', 'hidden'), moved('whiteboard', 'tab')]);
        expect(keys(placed.Tabs)).toEqual(['whiteboard']);
        expect(keys(placed.Hidden)).toEqual(['browser']);
    });

    it('ignores a move to a placement the surface does not allow', () => {
        const pinned = surface('report', 'tab', { AllowedPlacements: ['tab', 'hidden'] });
        expect(ResolveSurfacePlacements([pinned], [moved('report', 'stage')]).Stage).toBeNull();
    });

    describe('one stage: the latest move wins', () => {
        it('a surface moved to the stage takes it; the displaced avatar, whose default is the stage, goes to a PiP', () => {
            const placed = ResolveSurfacePlacements([avatar, camera, whiteboard], [moved('whiteboard', 'stage')]);
            expect(placed.Stage?.Key).toBe('whiteboard');
            expect(keys(placed.Pips)).toContain('avatar');
            expect(keys(placed.Tabs)).toEqual([]);
        });

        it('moving the avatar back sends the whiteboard to its own default, a tab', () => {
            const placed = ResolveSurfacePlacements([avatar, whiteboard], [moved('whiteboard', 'stage'), moved('avatar', 'stage')]);
            expect(placed.Stage?.Key).toBe('avatar');
            expect(keys(placed.Tabs)).toEqual(['whiteboard']);
        });

        it('without a move, the first surface whose default is the stage keeps it', () => {
            const second = surface('second-avatar', 'stage');
            const placed = ResolveSurfacePlacements([avatar, second], []);
            expect(placed.Stage?.Key).toBe('avatar');
            expect(keys(placed.Pips)).toEqual(['second-avatar']);
        });

        it('a displaced surface that may not be a PiP falls back to a tab', () => {
            const big = surface('big', 'stage', { AllowedPlacements: ['stage', 'tab'] });
            const placed = ResolveSurfacePlacements([big, whiteboard], [moved('whiteboard', 'stage')]);
            expect(keys(placed.Tabs)).toEqual(['big']);
        });
    });

    describe('PlacementOffStage', () => {
        it('sends a surface off the stage to its default', () => {
            expect(PlacementOffStage(whiteboard)).toBe('tab');
            expect(PlacementOffStage(camera)).toBe('pip');
        });

        it('sends a surface whose default is the stage to the first of PiP, tab and hidden it allows', () => {
            expect(PlacementOffStage(avatar)).toBe('pip');
            expect(PlacementOffStage(surface('big', 'stage', { AllowedPlacements: ['stage', 'hidden'] }))).toBe('hidden');
        });

        it('skips a default the surface does not allow, and hides one that allows nothing off the stage', () => {
            expect(PlacementOffStage(surface('odd', 'pip', { AllowedPlacements: ['stage', 'tab'] }))).toBe('tab');
            expect(PlacementOffStage(surface('only', 'stage', { AllowedPlacements: ['stage'] }))).toBe('hidden');
        });
    });

    describe('PiPs stack newest first', () => {
        it('by when they appeared', () => {
            expect(keys(ResolveSurfacePlacements([camera, screen], []).Pips)).toEqual(['screen', 'camera']);
        });

        it('a moved surface outranks those at their default, and a later move outranks an earlier one', () => {
            const placed = ResolveSurfacePlacements([camera, screen, whiteboard, browser], [moved('whiteboard', 'pip'), moved('browser', 'pip')]);
            expect(keys(placed.Pips)).toEqual(['browser', 'whiteboard', 'screen', 'camera']);
        });
    });

    it('a participant shown through a surface is not repeated among the others', () => {
        const bot = person('bot', { Role: 'agent', Video: { avatar: STREAM } });
        const layout = LayoutMediaStage({ Participants: [ME, bot, person('guest')], Surfaces: [avatar, camera] });
        expect(layout.Stage).toEqual({ Kind: 'surface', Surface: avatar });
        expect(ids(layout.Others)).toEqual(['guest']);
    });

    it('the spotlight participant takes the stage when no surface holds it', () => {
        const layout = LayoutMediaStage({ Participants: [ME, person('bot', { Role: 'agent' })], Surfaces: [whiteboard] });
        expect(layout.Stage).toEqual({ Kind: 'participant', Participant: expect.objectContaining({ Identity: 'bot' }) });
        expect(keys(layout.Tabs)).toEqual(['whiteboard']);
    });

    it('the spotlight is never a participant already shown in a PiP: the next in line takes it', () => {
        const speaking = person('bot', { Role: 'agent', IsSpeaking: true });
        const box = surface('bot-box', 'pip', { Video: { ParticipantIdentity: 'bot', Kind: 'camera' } });
        const layout = LayoutMediaStage({ Participants: [ME, speaking, person('guest')], ActiveSpeakers: ['bot'], Surfaces: [box] });
        expect(layout.Stage).toEqual({ Kind: 'participant', Participant: expect.objectContaining({ Identity: 'guest' }) });
        expect(keys(layout.Pips)).toEqual(['bot-box']);
        expect(ids(layout.Others)).toEqual(['me']);
    });

    it('reports a split while someone shares a screen', () => {
        const sharer = person('sharer', { Video: { screen: STREAM } });
        const layout = LayoutMediaStage({ Participants: [ME, sharer, person('bot', { Role: 'agent' })] });
        expect(layout.Split?.Sharer.Identity).toBe('sharer');
        expect(layout.Split?.Speaker?.Identity).toBe('bot');
        expect(LayoutMediaStage({ Participants: [ME] }).Split).toBeNull();
    });
});
