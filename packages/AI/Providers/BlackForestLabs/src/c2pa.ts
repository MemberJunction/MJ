/**
 * C2PA JUMBF UUID in ISO-BMFF `uuid` boxes: d8fec3d6-1b0e-483c-9297-5828877ec481
 */
const C2PA_JUMBF_UUID = Buffer.from([
    0xd8, 0xfe, 0xc3, 0xd6,
    0x1b, 0x0e,
    0x48, 0x3c,
    0x92, 0x97,
    0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
]);

const UUID_BOX_TYPE = 0x75756964; // 'uuid' in ASCII big-endian

/**
 * Inspects an ISO-BMFF (MP4/MOV) buffer's top-level boxes for a C2PA JUMBF `uuid` manifest box.
 *
 * Walks top-level `[size: u32 BE][type: 4 ASCII]` boxes:
 * - `size === 1`: reads 64-bit `largesize` at `+8` (header is 16 bytes)
 * - `size === 0`: box extends to the end of the buffer (header is 8 bytes)
 * - Any truncated or invalid box size stops the walk cleanly and returns `false`.
 */
export function HasC2PAManifest(bytes: Buffer): boolean {
    if (!Buffer.isBuffer(bytes) || bytes.length < 8) {
        return false;
    }

    let offset = 0;
    const totalLength = bytes.length;

    while (offset + 8 <= totalLength) {
        const size32 = bytes.readUInt32BE(offset);
        const boxType = bytes.readUInt32BE(offset + 4);

        let headerSize = 8;
        let boxSize: number;

        if (size32 === 1) {
            if (offset + 16 > totalLength) {
                return false;
            }
            const bigSize = bytes.readBigUInt64BE(offset + 8);
            if (bigSize < 16n || bigSize > BigInt(totalLength - offset)) {
                return false;
            }
            headerSize = 16;
            boxSize = Number(bigSize);
        } else if (size32 === 0) {
            boxSize = totalLength - offset;
        } else if (size32 < 8) {
            return false;
        } else {
            if (offset + size32 > totalLength) {
                return false;
            }
            boxSize = size32;
        }

        if (boxType === UUID_BOX_TYPE) {
            const uuidStart = offset + headerSize;
            if (uuidStart + 16 <= offset + boxSize && uuidStart + 16 <= totalLength) {
                if (bytes.subarray(uuidStart, uuidStart + 16).equals(C2PA_JUMBF_UUID)) {
                    return true;
                }
            }
        }

        offset += boxSize;
    }

    return false;
}
