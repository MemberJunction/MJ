import { describe, it, expect } from 'vitest';
import { FrameKindOfMimeType, FrameTypeKey, MimeCodec, MimeEssence, WebCodecsCodecOf } from '../media/decoders/videoMimeTypes';

describe('video MIME types', () => {
    it('reads the essence: type/subtype in lower case, without parameters', () => {
        expect(MimeEssence(' Video/MP4 ; codecs="avc1.42c01f"')).toBe('video/mp4');
    });

    it("reads the first entry of the codecs parameter, quoted or not, in any case of the parameter's name", () => {
        expect(MimeCodec('video/mp4; codecs="avc1.42c01f, mp4a.40.2"')).toBe('avc1.42c01f');
        expect(MimeCodec('video/vp8; CODECS=vp8')).toBe('vp8');
        expect(MimeCodec('video/h264; profile=1; codecs = "avc1.640028"')).toBe('avc1.640028');
        expect([MimeCodec('video/vp8'), MimeCodec('video/vp8; codecs=""')]).toEqual([undefined, undefined]);
    });

    it('names the frame kind: MP4 is fmp4, the WebCodecs chunk types are chunks, images are images', () => {
        const types = ['video/mp4', 'video/h264', 'video/vp8', 'video/vp9', 'video/av1', 'image/jpeg', 'image/x-anything', 'video/webm', 'audio/pcm'];
        const kinds = types.map(FrameKindOfMimeType);
        expect(kinds).toEqual(['fmp4', 'chunk', 'chunk', 'chunk', 'chunk', 'image', 'image', null, null]);
    });

    it('gives the WebCodecs codec string of a chunk type, only for its own codec family', () => {
        expect(WebCodecsCodecOf('video/h264; codecs="avc1.42e01f"')).toBe('avc1.42e01f');
        expect(WebCodecsCodecOf('video/h264; codecs="avc3.640028"')).toBe('avc3.640028');
        expect(WebCodecsCodecOf('video/vp8')).toBe('vp8');
        expect(WebCodecsCodecOf('video/av1; codecs="av01.0.04M.08"')).toBe('av01.0.04M.08');
        const refused = ['video/h264', 'video/vp9; codecs="vp8"', 'video/mp4; codecs="avc1.42e01f"'];
        expect(refused.map(WebCodecsCodecOf)).toEqual([null, null, null]);
    });

    it('keys a frame type by its kind and essence', () => {
        expect(FrameTypeKey('chunk', 'video/h264; codecs="avc1.42e01f"')).toBe(FrameTypeKey('chunk', 'VIDEO/H264'));
        expect(FrameTypeKey('chunk', 'video/vp8')).not.toBe(FrameTypeKey('image', 'video/vp8'));
    });
});
