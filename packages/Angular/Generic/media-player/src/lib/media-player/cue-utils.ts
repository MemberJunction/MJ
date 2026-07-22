import { MediaTranscriptCue } from '../media-player.types';

/**
 * Pure computation of the active transcript cue for a given playback position.
 *
 * A cue is active when `currentMs` falls within `[StartMs, end)` where `end` is:
 *  - the cue's own `EndMs` when present, OR
 *  - the next cue's `StartMs` (the cue runs until the next one begins), OR
 *  - `+Infinity` for the final cue with no `EndMs` (runs to the end of the media).
 *
 * Cues are assumed to be in chronological order by `StartMs`. When more than one
 * cue qualifies (overlapping ranges), the LAST qualifying cue wins, which matches
 * the "most recently started" intuition for transcripts.
 *
 * @param currentMs current playback position in milliseconds
 * @param cues the ordered transcript cues
 * @returns the index of the active cue, or -1 if none is active (e.g. before the first cue)
 */
export function computeActiveCueIndex(currentMs: number, cues: MediaTranscriptCue[] | null | undefined): number {
  if (!cues || cues.length === 0) {
    return -1;
  }

  let activeIndex = -1;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const start = cue.StartMs;
    const end = resolveCueEndMs(cues, i);
    if (currentMs >= start && currentMs < end) {
      activeIndex = i; // last qualifying wins
    }
  }
  return activeIndex;
}

/**
 * Resolves the effective end time (exclusive) of the cue at `index`.
 * Uses the cue's own `EndMs`, else the next cue's `StartMs`, else `+Infinity`.
 */
export function resolveCueEndMs(cues: MediaTranscriptCue[], index: number): number {
  const cue = cues[index];
  if (cue.EndMs != null) {
    return cue.EndMs;
  }
  const next = cues[index + 1];
  if (next) {
    return next.StartMs;
  }
  return Number.POSITIVE_INFINITY;
}
