import { describe, it, expect } from 'vitest';
import {
    RealtimeModalityRegistry,
    RealtimeTrackKey,
    ResolveMaxInboundVideoStreams,
    ResolveRequestedTracks,
    type RealtimeTrackDescriptor,
} from '../generic/realtimeTracks';

/** Deterministic id factory so assertions never depend on generated ids. */
const ids = (d: RealtimeTrackDescriptor, i: number) => `${d.Direction}:${String(d.Modality)}:${i}`;

const inAudio: RealtimeTrackDescriptor = { Modality: 'audio', Direction: 'inbound' };
const outAudio: RealtimeTrackDescriptor = { Modality: 'audio', Direction: 'outbound' };
const inVideo: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'inbound' };
const outVideo: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'outbound' };

describe('RealtimeModalityRegistry', () => {
    it('is a true singleton across accessor calls', () => {
        expect(RealtimeModalityRegistry.Instance).toBe(RealtimeModalityRegistry.Instance);
    });

    it('seeds the four well-known modalities', () => {
        const r = RealtimeModalityRegistry.Instance;
        for (const key of ['audio', 'video', 'image', 'text']) {
            expect(r.IsRegistered(key), key).toBe(true);
        }
    });

    it('declares audio and video as bidirectional and consent-gated', () => {
        const r = RealtimeModalityRegistry.Instance;
        for (const key of ['audio', 'video']) {
            const d = r.Get(key);
            expect(d?.Directions).toEqual(expect.arrayContaining(['inbound', 'outbound']));
            expect(d?.RequiresConsent, key).toBe(true);
        }
    });

    it('declares image as inbound-only — no provider in play emits images on a realtime session', () => {
        expect(RealtimeModalityRegistry.Instance.Get('image')?.Directions).toEqual(['inbound']);
    });

    it('looks up case- and whitespace-insensitively', () => {
        const r = RealtimeModalityRegistry.Instance;
        expect(r.Get('  VIDEO ')?.Key).toBe('video');
        expect(r.IsRegistered('Audio')).toBe(true);
    });

    it('returns undefined for an unregistered key rather than throwing — unknown modalities still transport', () => {
        expect(RealtimeModalityRegistry.Instance.Get('telemetry-not-registered')).toBeUndefined();
        expect(RealtimeModalityRegistry.Instance.IsRegistered('telemetry-not-registered')).toBe(false);
    });

    it('accepts a modality it has never heard of — the open vocabulary is the point', () => {
        const r = RealtimeModalityRegistry.Instance;
        r.Register({ Key: 'pose-test', DisplayName: 'Pose', Directions: ['inbound'] });
        expect(r.Get('pose-test')?.DisplayName).toBe('Pose');
    });

    it('lets a later registration replace an earlier one (ClassFactory convention)', () => {
        const r = RealtimeModalityRegistry.Instance;
        r.Register({ Key: 'replaceme-test', DisplayName: 'First', Directions: ['inbound'] });
        r.Register({ Key: 'replaceme-test', DisplayName: 'Second', Directions: ['outbound'] });
        expect(r.Get('replaceme-test')?.DisplayName).toBe('Second');
    });

    it('throws on a descriptor with no Key rather than registering something unfindable', () => {
        expect(() =>
            RealtimeModalityRegistry.Instance.Register({ Key: '', DisplayName: 'x', Directions: ['inbound'] })
        ).toThrow(/Key/);
    });

    it('exposes All for UI and diagnostics', () => {
        expect(RealtimeModalityRegistry.Instance.All.map((d) => d.Key)).toEqual(
            expect.arrayContaining(['audio', 'video', 'image', 'text'])
        );
    });
});

describe('ResolveRequestedTracks', () => {
    it('establishes NOTHING when nothing is requested — this is what makes video off-by-default structural', () => {
        expect(ResolveRequestedTracks(undefined, [inAudio, inVideo], ids)).toEqual([]);
        expect(ResolveRequestedTracks([], [inAudio, inVideo], ids)).toEqual([]);
    });

    it('does not establish video merely because the model supports it', () => {
        const resolved = ResolveRequestedTracks([inAudio], [inAudio, inVideo], ids);
        expect(resolved.map((t) => t.Descriptor.Modality)).toEqual(['audio']);
    });

    it('marks a supported request as requested, with no Reason', () => {
        const [t] = ResolveRequestedTracks([inVideo], [inVideo], ids);
        expect(t.State).toBe('requested');
        expect(t.Reason).toBeUndefined();
        expect(t.TrackID).toBe('inbound:video:0');
    });

    it('marks an unsupported request unsupported and KEEPS it, so callers can fall back deliberately', () => {
        const resolved = ResolveRequestedTracks([inAudio, inVideo], [inAudio], ids);
        expect(resolved).toHaveLength(2);
        const video = resolved.find((t) => t.Descriptor.Modality === 'video');
        expect(video?.State).toBe('unsupported');
        expect(video?.Reason).toMatch(/does not support inbound video/i);
    });

    it('treats direction as significant — outbound support does not satisfy an inbound request', () => {
        const [t] = ResolveRequestedTracks([inVideo], [outVideo], ids);
        expect(t.State).toBe('unsupported');
    });

    it('matches modality case-insensitively', () => {
        const [t] = ResolveRequestedTracks(
            [{ Modality: 'VIDEO', Direction: 'inbound' }],
            [{ Modality: 'video', Direction: 'inbound' }],
            ids
        );
        expect(t.State).toBe('requested');
    });

    it('treats absent model support as supporting nothing rather than everything', () => {
        const [t] = ResolveRequestedTracks([inAudio], undefined, ids);
        expect(t.State).toBe('unsupported');
    });

    it('preserves the requested descriptor verbatim, including encoding and consent', () => {
        const req: RealtimeTrackDescriptor = {
            Modality: 'video',
            Direction: 'inbound',
            Encoding: 'image/jpeg',
            Rate: 2,
            RequiresConsent: true,
            UsageBasis: ['frames'],
        };
        const [t] = ResolveRequestedTracks([req], [inVideo], ids);
        expect(t.Descriptor).toEqual(req);
    });

    it('refines Rate to the ceiling declared by the supported track', () => {
        const supportedWithRate: RealtimeTrackDescriptor = {
            Modality: 'video',
            Direction: 'inbound',
            Rate: 1,
        };
        const requestedHigherRate: RealtimeTrackDescriptor = {
            Modality: 'video',
            Direction: 'inbound',
            Rate: 4,
        };
        const [t] = ResolveRequestedTracks([requestedHigherRate], [supportedWithRate], ids);
        expect(t.Descriptor.Rate).toBe(1);
    });

    it('resolves a full duplex audio + inbound video set independently', () => {
        const resolved = ResolveRequestedTracks([inAudio, outAudio, inVideo], [inAudio, outAudio], ids);
        expect(resolved.map((t) => t.State)).toEqual(['requested', 'requested', 'unsupported']);
    });
});


describe('multi-source tracks (SourceID / Label)', () => {
    const video = (sourceId?: string): RealtimeTrackDescriptor => ({
        Modality: 'video',
        Direction: 'inbound',
        Rate: 1,
        SourceID: sourceId,
        Label: sourceId ? sourceId.toUpperCase() : undefined,
    });

    it('keys a track by direction, modality and source, case-insensitively on the modality', () => {
        expect(RealtimeTrackKey({ Modality: 'Video', Direction: 'inbound' })).toBe('inbound:video');
        expect(RealtimeTrackKey({ Modality: 'video', Direction: 'inbound', SourceID: 'cam' })).toBe('inbound:video:cam');
        expect(RealtimeTrackKey({ Modality: 'video', Direction: 'inbound', SourceID: '' })).toBe('inbound:video');
    });

    it('carries SourceID and Label through resolution untouched', () => {
        const [t] = ResolveRequestedTracks([video('cam')], [inVideo], ids);
        expect(t.Descriptor.SourceID).toBe('cam');
        expect(t.Descriptor.Label).toBe('CAM');
    });

    it('with no cap, every requested video stream resolves', () => {
        const resolved = ResolveRequestedTracks([video('a'), video('b'), video('c')], [inVideo], ids);
        expect(resolved.map((t) => t.State)).toEqual(['requested', 'requested', 'requested']);
    });

    it('caps inbound video streams: those over the limit are unsupported, with the reason, in request order', () => {
        const resolved = ResolveRequestedTracks([video('a'), video('b')], [inVideo], ids, { MaxInboundVideoStreams: 1 });
        expect(resolved.map((t) => t.State)).toEqual(['requested', 'unsupported']);
        expect(resolved[1].Reason).toMatch(/at most 1 inbound video stream/);
    });

    it('a cap of two admits two', () => {
        const resolved = ResolveRequestedTracks([video('a'), video('b'), video('c')], [inVideo], ids, { MaxInboundVideoStreams: 2 });
        expect(resolved.map((t) => t.State)).toEqual(['requested', 'requested', 'unsupported']);
    });

    it('a cap of zero refuses video but never touches audio', () => {
        const resolved = ResolveRequestedTracks([inAudio, video('a')], [inAudio, inVideo], ids, { MaxInboundVideoStreams: 0 });
        expect(resolved.map((t) => t.State)).toEqual(['requested', 'unsupported']);
    });

    it('the cap counts only INBOUND VIDEO', () => {
        const resolved = ResolveRequestedTracks([outVideo, video('a')], [inVideo, outVideo], ids, { MaxInboundVideoStreams: 1 });
        expect(resolved.map((t) => t.State)).toEqual(['requested', 'requested']);
    });

    it('an unsupported modality keeps its modality reason rather than the cap reason', () => {
        const [t] = ResolveRequestedTracks([video('a')], [inAudio], ids, { MaxInboundVideoStreams: 1 });
        expect(t.Reason).toMatch(/does not support inbound video/);
    });
});

describe('ResolveMaxInboundVideoStreams', () => {
    it('is zero for a model without video, whatever it declares', () => {
        expect(ResolveMaxInboundVideoStreams(false)).toBe(0);
        expect(ResolveMaxInboundVideoStreams(false, 4)).toBe(0);
    });

    it('is one for a video model that declares nothing, and the declaration when valid', () => {
        expect(ResolveMaxInboundVideoStreams(true)).toBe(1);
        expect(ResolveMaxInboundVideoStreams(true, null)).toBe(1);
        expect(ResolveMaxInboundVideoStreams(true, 3)).toBe(3);
    });

    it('treats a nonsensical declaration as undeclared, so a bad value cannot make a one-stream model unbounded', () => {
        for (const bad of [0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(ResolveMaxInboundVideoStreams(true, bad), String(bad)).toBe(1);
        }
    });
});
