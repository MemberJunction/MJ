/**
 * Formats a duration in seconds as `m:ss` (e.g. `0:45`, `1:30`, `59:59`).
 * Negative or non-finite values clamp to `0:00`.
 */
export function FormatVideoTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Formats a range in seconds as `m:ss–m:ss` (e.g. `0:30–1:00`).
 */
export function FormatVideoTimeRange(from: number, to: number): string {
  return `${FormatVideoTime(from)}\u2013${FormatVideoTime(to)}`;
}
