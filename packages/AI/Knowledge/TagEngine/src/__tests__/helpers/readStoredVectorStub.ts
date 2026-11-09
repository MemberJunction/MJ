/**
 * Test stand-in for `ReadStoredVector` from `@memberjunction/ai-vectors-memory`, for suites that mock that
 * package wholesale. Same contract: the binary column (base64 of little-endian float32 bytes) wins when it
 * decodes to a non-empty, finite vector; otherwise the JSON column; otherwise null.
 */
export function ReadStoredVectorStub(binary: string | null | undefined, json: string | null | undefined): number[] | null {
    if (binary) {
        const bytes = Buffer.from(binary, 'base64');
        if (bytes.length > 0 && bytes.length % 4 === 0) {
            const values = Array.from(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
            if (values.every(Number.isFinite)) return values;
        }
    }
    if (!json) return null;
    try {
        const parsed: unknown = JSON.parse(json);
        return Array.isArray(parsed) && parsed.length > 0 && parsed.every(v => typeof v === 'number' && Number.isFinite(v))
            ? parsed as number[]
            : null;
    } catch {
        return null;
    }
}
