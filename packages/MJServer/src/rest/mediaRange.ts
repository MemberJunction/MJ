/**
 * @fileoverview Pure HTTP `Range` header parsing for the `/media/:fileId` stream route.
 *
 * Split out of {@link module:@memberjunction/server/rest/MediaStreamHandler} (which pulls in
 * auth/config/storage at module load) so this load-bearing parsing logic is unit-testable in
 * isolation — same pattern as `peaksSidecar.ts`. These functions decide whether a request gets
 * a 206 partial body (and over which byte window) vs. a full 200 / a 416.
 *
 * Both helpers are deliberately strict single-range parsers: anything malformed, multi-range,
 * or suffix-only (`bytes=-N`) yields `undefined`, letting the caller fall back to a full read
 * (streaming path) or a 416 (buffer path).
 *
 * @module @memberjunction/server/rest/mediaRange
 */

/** A parsed, validated `Range` request against a known total size. */
export interface ParsedRange {
  start: number;
  end: number;
}

/**
 * A parsed `Range` request WITHOUT a known total (streaming path). `end` is undefined
 * for an open-ended `bytes=start-` request, matching `ByteRange`'s "omit End = EOF".
 */
export interface ParsedOpenRange {
  start: number;
  end?: number;
}

/**
 * Parses a single-range `bytes=start-end` header WITHOUT a known total (streaming path).
 * Returns the inclusive offsets, or undefined when the header is malformed/multi-range/
 * suffix-only (those we leave to the driver as a full read). `end` is left undefined when
 * open-ended (`bytes=start-`) so the driver streams to EOF.
 */
export function parseRangeHeaderLoose(rangeHeader: string): ParsedOpenRange | undefined {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  if (!Number.isFinite(start)) {
    return undefined;
  }
  if (match[2] === '') {
    return { start };
  }
  const end = Number(match[2]);
  if (!Number.isFinite(end) || end < start) {
    return undefined;
  }
  return { start, end };
}

/**
 * Parses a single-range `bytes=start-end` header against a known total (buffer path),
 * clamping `end` to the last byte. Returns undefined when unsatisfiable (→ 416) or
 * malformed/multi-range.
 */
export function parseRange(rangeHeader: string, total: number): ParsedRange | undefined {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  if (!Number.isFinite(start) || start >= total) {
    return undefined; // start past EOF → unsatisfiable
  }
  const requestedEnd = match[2] === '' ? total - 1 : Number(match[2]);
  const end = Math.min(requestedEnd, total - 1);
  if (end < start) {
    return undefined;
  }
  return { start, end };
}
