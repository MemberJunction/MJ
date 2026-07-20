/**
 * @fileoverview Pure helper for recognizing a STREAMED transcript continuation.
 *
 * Deliberately dependency-free: it is imported by realtime drivers on both the server
 * (`@memberjunction/ai-openai`) and the browser (`@memberjunction/ai-realtime-client`), and keeping it
 * free of base-class imports lets those packages' tests exercise the REAL implementation instead of a
 * hand-written stub that could silently drift from it.
 *
 * @module @memberjunction/ai
 */

/**
 * Decides whether a newly-arrived transcript is a CONTINUATION of one already in flight — i.e. the
 * same utterance re-emitted with more words on the end — rather than a genuinely new turn.
 *
 * **Why this exists.** Providers that stream their input transcription (Grok) re-emit the FULL
 * accumulated utterance on every `completed` frame, and their VAD fires `speech_started` on ordinary
 * mid-sentence pauses. Treating each `speech_started` as a hard turn boundary therefore splits ONE
 * spoken thought into several persisted turns, each a longer copy of the last:
 *
 * ```
 * "...including whiteboarding, uh, remote."                      ← turn 1
 * "...including whiteboarding, uh, remote, so just get going."   ← turn 2 (repeats turn 1)
 * ```
 *
 * **Why a naive prefix test is not enough.** ASR engines RE-PUNCTUATE as a sentence continues, so the
 * earlier text is frequently *not* a literal prefix of the later one (`remote.` becomes `remote,`
 * above — observed in production). Both sides are therefore normalized — lowercased, punctuation and
 * repeated whitespace collapsed — before the prefix comparison, which is what makes the real case match.
 *
 * Callers should scope this to a single speaker turn: clear the tracked text once the model responds,
 * so two genuinely separate utterances that happen to share an opening can never be merged.
 *
 * @param previous The text of the turn currently in flight (empty/undefined ⇒ never a continuation).
 * @param next The newly-arrived transcript text.
 * @returns True when `next` extends `previous` and should REPLACE it in place.
 */
export function IsTranscriptContinuation(previous: string | undefined, next: string | undefined): boolean {
    if (!previous || !next) {
        return false;
    }
    const before = NormalizeTranscriptForComparison(previous);
    const after = NormalizeTranscriptForComparison(next);
    if (!before || !after) {
        return false;
    }
    // Strictly longer AND starting with everything seen so far ⇒ the same utterance, extended.
    return after.length > before.length && after.startsWith(before);
}

/**
 * Reduces a transcript to a comparison form: lowercased, with every run of non-alphanumeric
 * characters (punctuation, whitespace) collapsed to a single space and the ends trimmed.
 *
 * This is what makes continuation detection survive an ASR re-punctuating mid-sentence.
 *
 * @param value The raw transcript text.
 * @returns The normalized comparison form.
 */
export function NormalizeTranscriptForComparison(value: string): string {
    return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
