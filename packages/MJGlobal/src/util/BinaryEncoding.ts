/**
 * Binary encoding primitives shared by every MemberJunction tier.
 *
 * MemberJunction stores binary database columns (SQL Server `binary` / `varbinary` / `image`,
 * PostgreSQL `bytea`) in `BaseEntity` and on the wire as **base64 strings**. A string keeps the
 * value JSON-safe, so dirty tracking, Record Changes, the RunView caches, GraphQL and remote
 * invalidation broadcasts all handle it without special cases. Code that needs the actual bytes
 * converts at the edge with the functions in this module.
 *
 * Everything here is dependency-free and runs unchanged in browsers, Node and workers. Each
 * conversion picks the fastest implementation the host offers:
 *
 * | Host | base64 → bytes | bytes → base64 |
 * |---|---|---|
 * | Browsers with the TC39 base64 API (Chrome 140+, Firefox 133+, Safari 18.2+) | `Uint8Array.fromBase64` | `Uint8Array.prototype.toBase64` |
 * | Node.js | `Buffer.from(s, 'base64')` | `Buffer#toString('base64')` |
 * | Anything else | `atob` | `btoa` (chunked) |
 *
 * The fast paths are detected by duck typing, once per process, so older browsers keep working.
 * All three implementations accept and produce exactly the same strings, and the decoders
 * validate input identically, so a value never decodes on one tier and fails on another.
 *
 * @module BinaryEncoding
 */

/** Options of the TC39 `Uint8Array.fromBase64` proposal that this module relies on. */
interface NativeFromBase64Options {
    alphabet?: 'base64' | 'base64url';
    lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial';
}

/** `Uint8Array` constructor statics added by the TC39 base64 proposal. */
interface NativeBase64Statics {
    fromBase64(input: string, options?: NativeFromBase64Options): Uint8Array;
}

/** `Uint8Array` instance method added by the TC39 base64 proposal. */
interface NativeBase64Instance {
    toBase64(options?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }): string;
}

/** The subset of Node's `Buffer` this module uses; typed structurally so browsers need no Node types. */
type NodeBufferInstance = Uint8Array & { toString(encoding: 'base64'): string };

/** The subset of Node's `Buffer` constructor this module uses. */
interface NodeBufferStatics {
    from(input: string, encoding: 'base64'): NodeBufferInstance;
    from(arrayBuffer: ArrayBufferLike, byteOffset?: number, length?: number): NodeBufferInstance;
}

/**
 * One way of converting between bytes and base64. Every implementation must accept and produce
 * the same strings; {@link Base64Codecs} lists them so tests can prove that.
 */
export interface Base64Codec {
    /** Human-readable name, used in diagnostics and tests. */
    readonly Name: string;
    /** True when the host supports this implementation. */
    IsAvailable(): boolean;
    /** Encodes bytes as standard, padded base64 (RFC 4648 §4). */
    Encode(bytes: Uint8Array): string;
    /**
     * Decodes base64 that has already passed {@link IsValidBase64}. Implementations may assume
     * valid input; the public functions validate first so every implementation fails the same way.
     */
    Decode(base64: string): Uint8Array;
    /**
     * Optional fused validate-and-decode: returns the bytes when `base64` passes
     * {@link IsValidBase64}, else `null` — exactly the same accept/reject decision, made more cheaply
     * than a separate character scan. Codecs without it are validated with {@link IsValidBase64}.
     */
    TryDecode?(base64: string): Uint8Array | null;
}

/**
 * Lookup table over every UTF-16 code unit (64 KB, so the scan needs no range check): 1 for the standard base64 alphabet (`A–Z a–z 0–9 + /`),
 * 0 otherwise. Data URIs, URL-safe base64 and MIME line breaks are deliberately rejected: binary
 * columns only ever carry canonical base64. A table scan is used instead of a regular expression
 * because validation runs on every decode, and on an 8 KB vector a regex costs about five times
 * as much as the decode itself.
 */
/** Char code of the base64 padding character `=`. */
const EQUALS_CODE = 0x3d;

const BASE64_ALPHABET: Uint8Array = (() => {
    const table = new Uint8Array(0x10000);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = 1;
    return table;
})();

/** `String.fromCharCode` argument count per call when building a binary string for `btoa`. */
const BTOA_CHUNK = 0x8000;

/** Reads a global by name without assuming any particular host typings. */
function readGlobal<T>(name: string): T | undefined {
    return Reflect.get(globalThis, name) as T | undefined;
}

/** Native TC39 base64 support on `Uint8Array`, detected by duck typing. */
const NativeCodec: Base64Codec = {
    Name: 'Uint8Array.fromBase64 / toBase64',
    IsAvailable(): boolean {
        return typeof Reflect.get(Uint8Array, 'fromBase64') === 'function'
            && typeof Reflect.get(Uint8Array.prototype, 'toBase64') === 'function';
    },
    Encode(bytes: Uint8Array): string {
        return (bytes as Uint8Array & NativeBase64Instance).toBase64();
    },
    Decode(base64: string): Uint8Array {
        const fromBase64 = Reflect.get(Uint8Array, 'fromBase64') as NativeBase64Statics['fromBase64'];
        return fromBase64.call(Uint8Array, base64, { lastChunkHandling: 'loose' });
    },
};

/** Node's `Buffer`, which encodes and decodes in native code. */
const NodeBufferCodec: Base64Codec = {
    Name: 'Node Buffer',
    IsAvailable(): boolean {
        return typeof readGlobal<NodeBufferStatics>('Buffer')?.from === 'function';
    },
    Encode(bytes: Uint8Array): string {
        const nodeBuffer = readGlobal<NodeBufferStatics>('Buffer') as NodeBufferStatics;
        return nodeBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    },
    Decode(base64: string): Uint8Array {
        const nodeBuffer = readGlobal<NodeBufferStatics>('Buffer') as NodeBufferStatics;
        const decoded = nodeBuffer.from(base64, 'base64');
        // Copy out of Node's shared allocation pool: a pooled Buffer views a larger ArrayBuffer at
        // an arbitrary offset, which typed-array views and transfers would otherwise trip over.
        return new Uint8Array(decoded);
    },
    /**
     * Validates by decoding. Node's decoder silently SKIPS characters outside the alphabet
     * (whitespace, punctuation, non-ASCII) and stops at an early `=`, so any such character makes the
     * output shorter than a canonical string of the same length decodes to — the length check rejects
     * it. The one thing it accepts that canonical base64 does not is the URL-safe alphabet (`-`, `_`),
     * rejected separately with a native `indexOf`. About five times cheaper than a JavaScript
     * character scan on vector-sized values; fuzz-tested against {@link IsValidBase64}.
     */
    TryDecode(base64: string): Uint8Array | null {
        if (!HasValidBase64Shape(base64)) return null;
        if (base64.indexOf('-') !== -1 || base64.indexOf('_') !== -1) return null;
        if (base64.length === 0) return new Uint8Array(0);
        const decoded = this.Decode(base64);
        return decoded.length === Base64DecodedByteLength(base64) ? decoded : null;
    },
};

/** `atob` / `btoa`, available in every browser, worker and modern Node. */
const PortableCodec: Base64Codec = {
    Name: 'atob / btoa',
    IsAvailable(): boolean {
        return typeof readGlobal<unknown>('atob') === 'function' && typeof readGlobal<unknown>('btoa') === 'function';
    },
    Encode(bytes: Uint8Array): string {
        let binary = '';
        for (let start = 0; start < bytes.length; start += BTOA_CHUNK) {
            const chunk = bytes.subarray(start, Math.min(start + BTOA_CHUNK, bytes.length));
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    },
    Decode(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    },
};

/**
 * Every base64 implementation, fastest first. Exposed so tests can prove the implementations are
 * interchangeable; application code should call {@link BytesToBase64} / {@link Base64ToBytes}.
 */
export const Base64Codecs: readonly Base64Codec[] = [NativeCodec, NodeBufferCodec, PortableCodec];

let selectedCodec: Base64Codec | undefined;

/**
 * Returns the fastest base64 implementation this host supports. The choice is made once and
 * cached; it cannot change during a process's life.
 *
 * @throws Error when the host offers none of the implementations (no JavaScript host MJ supports).
 */
export function GetBase64Codec(): Base64Codec {
    const codec = findBase64Codec();
    if (!codec) throw new Error('No base64 implementation is available on this host');
    return codec;
}

/** The selected codec, choosing it on first use; `undefined` when the host offers none. */
function findBase64Codec(): Base64Codec | undefined {
    selectedCodec ??= Base64Codecs.find(codec => codec.IsAvailable());
    return selectedCodec;
}

/**
 * True when `value` is canonical base64: the standard alphabet (`A–Z a–z 0–9 + /`), optional
 * `=` padding, no whitespace, and a length that can encode whole bytes. The empty string is valid
 * and decodes to zero bytes.
 *
 * @param value - The string to check.
 */
export function IsValidBase64(value: string): boolean {
    if (!HasValidBase64Shape(value)) return false;
    const dataLength = value.length - trailingPadding(value);
    for (let i = 0; i < dataLength; i++) {
        if (BASE64_ALPHABET[value.charCodeAt(i)] === 0) return false;
    }
    return true;
}

/** Number of trailing `=` characters, counting at most two. */
function trailingPadding(value: string): number {
    const length = value.length;
    if (length === 0 || value.charCodeAt(length - 1) !== EQUALS_CODE) return 0;
    return length > 1 && value.charCodeAt(length - 2) === EQUALS_CODE ? 2 : 1;
}

/**
 * The length rules of canonical base64, without looking at the characters: a length that can
 * encode whole bytes, and padding only on a full final quantum ("xx==" or "xxx="), never on a bare
 * remainder. Part of {@link IsValidBase64}; exposed so a codec's fused validate-and-decode
 * ({@link Base64Codec.TryDecode}) applies the same rules.
 *
 * @param value - The string to check.
 */
export function HasValidBase64Shape(value: string): boolean {
    const length = value.length;
    if (length % 4 === 1) return false;
    return trailingPadding(value) === 0 || length % 4 === 0;
}

/**
 * Returns how many bytes a base64 string decodes to, without decoding it. Useful for size checks
 * on large values. The input is assumed to be valid (see {@link IsValidBase64}); padding is
 * optional.
 *
 * @param base64 - Canonical base64.
 */
export function Base64DecodedByteLength(base64: string): number {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const dataChars = base64.length - padding;
    return Math.floor((dataChars * 3) / 4);
}

/** Prefix of the text recorded in a change log in place of a binary value. See {@link FormatBinaryChangeValue}. */
export const BINARY_CHANGE_VALUE_PREFIX = '[binary:';

/**
 * The text a change log records, and change history shows, in place of a binary field's base64
 * value: `[binary: 6,144 bytes]`. The bytes themselves stay in the record snapshot
 * (`FullRecordJSON`), which restore reads; only the per-field diff (`ChangesJSON`) and its
 * on-screen rendering use this, so a change to an embedding or a file is visible without carrying
 * the content twice more per save. Invalid base64 is reported as such rather than thrown on.
 *
 * @param base64 - The field's value as held above the database.
 */
export function FormatBinaryChangeValue(base64: string): string {
    if (!IsValidBase64(base64)) return `${BINARY_CHANGE_VALUE_PREFIX} invalid base64]`;
    return `${BINARY_CHANGE_VALUE_PREFIX} ${Base64DecodedByteLength(base64).toLocaleString('en-US')} bytes]`;
}

/** Whether `value` is text produced by {@link FormatBinaryChangeValue}, so it is shown as-is and never decoded. */
export function IsBinaryChangeValue(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(BINARY_CHANGE_VALUE_PREFIX) && value.endsWith(']');
}

/**
 * Encodes bytes as standard, padded base64 using the fastest implementation the host offers.
 *
 * @param bytes - The bytes to encode. Any `Uint8Array` works, including a Node `Buffer` or a view
 *   into a larger buffer; only the viewed range is encoded.
 * @returns The base64 string; `''` for zero bytes.
 */
export function BytesToBase64(bytes: Uint8Array): string {
    if (bytes.length === 0) return '';
    return GetBase64Codec().Encode(bytes);
}

/**
 * Decodes base64 into a new `Uint8Array` that owns its own `ArrayBuffer` (offset 0, never a view
 * into a shared pool), using the fastest implementation the host offers.
 *
 * @param base64 - Canonical base64 (see {@link IsValidBase64}); padding may be omitted.
 * @returns The decoded bytes.
 * @throws Error when `base64` is not valid base64. Use {@link TryBase64ToBytes} to get `null` instead.
 */
export function Base64ToBytes(base64: string): Uint8Array {
    const bytes = decodeValidated(base64);
    if (!bytes) {
        throw new Error(`Invalid base64 value (length ${base64.length})`);
    }
    return bytes;
}

/**
 * Validates and decodes in one step: the codec's fused {@link Base64Codec.TryDecode} when it has
 * one, else {@link IsValidBase64} followed by a plain decode. `null` when invalid.
 */
function decodeValidated(base64: string): Uint8Array | null {
    if (base64.length === 0) return new Uint8Array(0);
    const codec = findBase64Codec();
    if (codec?.TryDecode) return codec.TryDecode(base64);
    // No fused decoder — or no codec at all, in which case invalid input still answers null and
    // only a valid value reaches GetBase64Codec() and its "no implementation" error.
    if (!IsValidBase64(base64)) return null;
    return (codec ?? GetBase64Codec()).Decode(base64);
}

/**
 * Like {@link Base64ToBytes}, but returns `null` instead of throwing when the input is not a
 * string or not valid base64. Convenient for reading a nullable binary entity field.
 *
 * @param base64 - The value to decode, typically a binary entity field (`string | null`).
 */
export function TryBase64ToBytes(base64: string | null | undefined): Uint8Array | null {
    return typeof base64 === 'string' ? decodeValidated(base64) : null;
}

/**
 * True when `value` is a byte array: a `Uint8Array`, which includes a Node `Buffer`. Database
 * drivers return binary columns this way; use it at the provider boundary to recognise values
 * that must be converted to base64 before they reach a `BaseEntity`.
 *
 * @param value - Any value.
 */
export function IsByteArray(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
}

/**
 * Returns `row` with every top-level byte-array value replaced by its base64 string.
 *
 * Copy-on-write: when the row holds no byte arrays (the normal case, since the database providers
 * already convert binary columns) the same object is returned untouched; otherwise a shallow copy
 * is returned and the original — which may be a frozen cache entry — is never modified.
 *
 * Use it as a safety net wherever rows are serialized for a transport: `JSON.stringify` turns a
 * Node `Buffer` into `{"type":"Buffer","data":[...]}` and GraphQL's `String` scalar rejects it.
 *
 * @param row - A data row.
 */
export function ReplaceByteArraysWithBase64<T extends Record<string, unknown>>(row: T): T {
    let copy: Record<string, unknown> | null = null;
    for (const key of Object.keys(row)) {
        const value = row[key];
        if (IsByteArray(value)) {
            if (!copy) copy = { ...row };
            copy[key] = BytesToBase64(value);
        }
    }
    return (copy ?? row) as T;
}

/* ------------------------------------------------------------------------------------------ */
/* Float32 vectors                                                                             */
/* ------------------------------------------------------------------------------------------ */

/**
 * The byte layout MemberJunction uses for persisted embedding vectors: consecutive
 * IEEE-754 single-precision values, little-endian, 4 bytes each, no header. The dimension count
 * is `byteLength / 4`. This is the layout of a `Float32Array` on every little-endian host, which
 * is every platform MemberJunction runs on; big-endian hosts are still handled correctly.
 */
export const FLOAT32_VECTOR_BYTES_PER_VALUE = 4;

/**
 * Converts between numbers and the {@link FLOAT32_VECTOR_BYTES_PER_VALUE little-endian float32}
 * layout. Two implementations exist so the result is correct on any host:
 * a typed-array copy (little-endian hosts) and an explicit `DataView` (any host).
 */
export interface Float32VectorCodec {
    /** Human-readable name, used in tests. */
    readonly Name: string;
    /** Writes `values` as little-endian float32 bytes into a new array. */
    Encode(values: ArrayLike<number>): Uint8Array;
    /** Reads little-endian float32 bytes (length already checked to be a positive multiple of 4). */
    Decode(bytes: Uint8Array): Float32Array;
}

/** True when this host stores multi-byte numbers little-endian. */
function hostIsLittleEndian(): boolean {
    return new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
}

/** Typed-array copy; correct only on little-endian hosts. */
const TypedArrayFloat32Codec: Float32VectorCodec = {
    Name: 'typed array (little-endian host)',
    Encode(values: ArrayLike<number>): Uint8Array {
        return new Uint8Array(Float32Array.from(values).buffer);
    },
    Decode(bytes: Uint8Array): Float32Array {
        // Copy first: the source may be a misaligned view (e.g. a pooled Node Buffer), and a
        // Float32Array over it would also alias memory the caller does not own.
        return new Float32Array(bytes.slice().buffer);
    },
};

/** Explicit little-endian reads and writes; correct on every host. */
const DataViewFloat32Codec: Float32VectorCodec = {
    Name: 'DataView (any host)',
    Encode(values: ArrayLike<number>): Uint8Array {
        const bytes = new Uint8Array(values.length * FLOAT32_VECTOR_BYTES_PER_VALUE);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < values.length; i++) view.setFloat32(i * FLOAT32_VECTOR_BYTES_PER_VALUE, values[i], true);
        return bytes;
    },
    Decode(bytes: Uint8Array): Float32Array {
        const count = bytes.byteLength / FLOAT32_VECTOR_BYTES_PER_VALUE;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const values = new Float32Array(count);
        for (let i = 0; i < count; i++) values[i] = view.getFloat32(i * FLOAT32_VECTOR_BYTES_PER_VALUE, true);
        return values;
    },
};

/** Both float32 vector implementations. Exposed for tests; use the functions below instead. */
export const Float32VectorCodecs: readonly Float32VectorCodec[] = [TypedArrayFloat32Codec, DataViewFloat32Codec];

const float32Codec: Float32VectorCodec = hostIsLittleEndian() ? TypedArrayFloat32Codec : DataViewFloat32Codec;

/**
 * Encodes a vector as little-endian float32 bytes. Values are rounded to single precision, which
 * is the precision embedding models produce; `NaN` and infinities are stored as-is.
 *
 * @param values - The vector, e.g. a `number[]` or a `Float32Array`.
 * @returns A new byte array of `values.length × 4` bytes.
 */
export function Float32VectorToBytes(values: ArrayLike<number>): Uint8Array {
    return float32Codec.Encode(values);
}

/**
 * Decodes little-endian float32 bytes into a new `Float32Array` that owns its memory.
 *
 * @param bytes - Bytes in the {@link FLOAT32_VECTOR_BYTES_PER_VALUE persisted vector layout}.
 * @returns The vector, or `null` when `bytes` is empty or not a whole number of float32 values,
 *   so a truncated or foreign value is treated as missing rather than misread.
 */
export function BytesToFloat32Vector(bytes: Uint8Array | null | undefined): Float32Array | null {
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength % FLOAT32_VECTOR_BYTES_PER_VALUE !== 0) return null;
    return float32Codec.Decode(bytes);
}

/**
 * Encodes a vector as base64 of its little-endian float32 bytes: the value stored in a binary
 * vector entity field such as `VectorBinary`.
 *
 * @param values - The vector.
 */
export function Float32VectorToBase64(values: ArrayLike<number>): string {
    return BytesToBase64(Float32VectorToBytes(values));
}

/**
 * Decodes a binary vector entity field (base64 of little-endian float32 bytes).
 *
 * @param base64 - The field value; `null` / `undefined` are allowed.
 * @returns The vector, or `null` when the value is missing, not valid base64, empty, or not a
 *   whole number of float32 values. Callers usually fall back to a JSON copy of the vector.
 */
export function Base64ToFloat32Vector(base64: string | null | undefined): Float32Array | null {
    return BytesToFloat32Vector(TryBase64ToBytes(base64));
}
