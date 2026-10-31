import { describe, it, expect } from 'vitest';
import { HasC2PAManifest } from '../c2pa.js';

const C2PA_UUID_BYTES = Buffer.from([
    0xd8, 0xfe, 0xc3, 0xd6,
    0x1b, 0x0e,
    0x48, 0x3c,
    0x92, 0x97,
    0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
]);

function makeBox(type: string, payload: Buffer): Buffer {
    const size = 8 + payload.length;
    const header = Buffer.alloc(8);
    header.writeUInt32BE(size, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, payload]);
}

function makeLargeBox(type: string, payload: Buffer): Buffer {
    const size = BigInt(16 + payload.length);
    const header = Buffer.alloc(16);
    header.writeUInt32BE(1, 0);
    header.write(type, 4, 4, 'ascii');
    header.writeBigUInt64BE(size, 8);
    return Buffer.concat([header, payload]);
}

describe('HasC2PAManifest', () => {
    it('returns true when a top-level uuid box has the C2PA JUMBF UUID', () => {
        const ftyp = makeBox('ftyp', Buffer.from('isom0000isomiso2', 'ascii'));
        const c2paPayload = Buffer.concat([C2PA_UUID_BYTES, Buffer.from('jumbf-manifest-content', 'ascii')]);
        const uuidBox = makeBox('uuid', c2paPayload);
        const mdat = makeBox('mdat', Buffer.alloc(32));

        const mp4 = Buffer.concat([ftyp, uuidBox, mdat]);
        expect(HasC2PAManifest(mp4)).toBe(true);
    });

    it('returns true when the C2PA uuid box follows a 64-bit (size === 1) box', () => {
        const ftyp = makeBox('ftyp', Buffer.from('isom0000', 'ascii'));
        const largeMdat = makeLargeBox('mdat', Buffer.alloc(64));
        const c2paBox = makeBox('uuid', Buffer.concat([C2PA_UUID_BYTES, Buffer.from('manifest')]));

        const mp4 = Buffer.concat([ftyp, largeMdat, c2paBox]);
        expect(HasC2PAManifest(mp4)).toBe(true);
    });

    it('returns true when the C2PA uuid box uses size === 0 (extends to end of file)', () => {
        const ftyp = makeBox('ftyp', Buffer.from('isom0000', 'ascii'));
        const toEndHeader = Buffer.alloc(8);
        toEndHeader.writeUInt32BE(0, 0);
        toEndHeader.write('uuid', 4, 4, 'ascii');
        const c2paToEnd = Buffer.concat([toEndHeader, C2PA_UUID_BYTES, Buffer.from('tail-payload')]);

        expect(HasC2PAManifest(Buffer.concat([ftyp, c2paToEnd]))).toBe(true);
    });

    it('returns false when no C2PA uuid box is present or uuid has a different extended type', () => {
        const ftyp = makeBox('ftyp', Buffer.from('isom0000', 'ascii'));
        const otherUuid = makeBox('uuid', Buffer.concat([Buffer.alloc(16, 0xaa), Buffer.from('other')]));
        const mdat = makeBox('mdat', Buffer.alloc(24));

        expect(HasC2PAManifest(Buffer.concat([ftyp, otherUuid, mdat]))).toBe(false);
        expect(HasC2PAManifest(Buffer.concat([ftyp, mdat]))).toBe(false);
    });

    it('stops cleanly and returns false on truncated or malformed box sizes', () => {
        expect(HasC2PAManifest(Buffer.alloc(0))).toBe(false);
        expect(HasC2PAManifest(Buffer.from([0x00, 0x01, 0x02]))).toBe(false);

        // Box claims 500 bytes when buffer is only 16 bytes
        const truncated = Buffer.alloc(16);
        truncated.writeUInt32BE(500, 0);
        truncated.write('ftyp', 4, 4, 'ascii');
        expect(HasC2PAManifest(truncated)).toBe(false);

        // Invalid box size < 8 (and not 0 or 1)
        const invalidSmallSize = Buffer.alloc(24);
        invalidSmallSize.writeUInt32BE(4, 0);
        invalidSmallSize.write('free', 4, 4, 'ascii');
        expect(HasC2PAManifest(invalidSmallSize)).toBe(false);

        // Truncated 64-bit box header (< 16 bytes remaining)
        const truncatedLarge = Buffer.alloc(12);
        truncatedLarge.writeUInt32BE(1, 0);
        truncatedLarge.write('mdat', 4, 4, 'ascii');
        expect(HasC2PAManifest(truncatedLarge)).toBe(false);
    });
});
