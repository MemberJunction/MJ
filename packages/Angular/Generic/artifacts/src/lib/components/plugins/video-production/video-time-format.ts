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

/**
 * Semantic badge variants shared by Video Studio galleries and the video production viewer.
 */
export type VideoBadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

const SUCCESS_STATUSES: ReadonlySet<string> = new Set([
  'delivered',
  'complete',
  'completed',
  'approved',
  'passed',
  'fixed',
  'active',
  'ok',
]);

const ERROR_STATUSES: ReadonlySet<string> = new Set([
  'blocked',
  'failed',
  'blocker',
  'error',
]);

const WARNING_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'major',
  'warning',
]);

const INFO_STATUSES: ReadonlySet<string> = new Set([
  'briefing',
  'styled',
  'storyboarded',
  'preproduced',
  'composed',
  'roughcut',
  'reviewed',
  'rendering',
]);

/**
 * Maps a production, gate, rubric, defect, or brand-kit status/severity string
 * to a single semantic badge variant:
 * - Delivered / Complete / Approved / Passed / Fixed / Active -> 'success'
 * - Blocked / Failed / Blocker -> 'error'
 * - Pending / Major -> 'warning'
 * - In-flight pipeline stages (Briefing ... Rendering) -> 'info'
 * - Everything else (Draft, Unknown, Inactive, Minor, ...) -> 'neutral'
 */
export function GetVideoStatusBadgeVariant(
  status: string | null | undefined,
): VideoBadgeVariant {
  const normalized = (status ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'neutral';
  }
  if (SUCCESS_STATUSES.has(normalized)) {
    return 'success';
  }
  if (ERROR_STATUSES.has(normalized)) {
    return 'error';
  }
  if (WARNING_STATUSES.has(normalized)) {
    return 'warning';
  }
  if (INFO_STATUSES.has(normalized)) {
    return 'info';
  }
  return 'neutral';
}

