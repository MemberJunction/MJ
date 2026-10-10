/**
 * @fileoverview Reports the input frames a realtime session drops instead of sending.
 *
 * Dependency-free at runtime (its one import is a type): the server realtime drivers use it, and their tests that mock
 * `@memberjunction/ai` load the real implementation from this file, as they do `IsTranscriptContinuation`.
 *
 * @module @memberjunction/ai
 */

import type { RealtimeInputFrame } from './baseRealtime';

/**
 * Reports the input frames a realtime session drops, once per kind and type for the life of the session rather than
 * once per frame. A camera sends a frame or more a second, so a session that cannot send video would otherwise log a
 * line for each.
 *
 * `IRealtimeSession.SendInput` says a driver drops a frame it cannot send rather than sending it as something else. A
 * session creates one reporter when it is created and passes each frame it drops to {@link Report}.
 *
 * @example
 * ```typescript
 * private readonly droppedInput = new RealtimeDroppedInputReporter('AssemblyAIRealtime', 'this session sends audio only');
 *
 * public SendInput(frame: RealtimeInputFrame): void {
 *     if (frame.Kind !== 'audio') {
 *         this.droppedInput.Report(frame);
 *         return;
 *     }
 *     // send the audio
 * }
 * ```
 */
export class RealtimeDroppedInputReporter {
    /** The kinds and types already reported, as `kind:type` with the type lowercased. */
    private readonly reported = new Set<string>();

    /**
     * @param source The driver's name, which opens each line in brackets, for example `'AssemblyAIRealtime'`.
     * @param reason Why such frames are dropped, which ends each line, for example `'this session sends audio only'`.
     */
    constructor(
        private readonly source: string,
        private readonly reason: string
    ) {}

    /**
     * Reports a frame the session dropped: one `console.warn` the first time a kind and type is dropped, nothing for
     * later frames of the same kind and type (types compare case-insensitively). A frame with no type is reported as
     * `(no type)`.
     *
     * @param frame The frame the session did not send.
     */
    public Report(frame: RealtimeInputFrame): void {
        const mimeType = frame.MimeType?.trim() || '(no type)';
        const key = `${frame.Kind}:${mimeType.toLowerCase()}`;
        if (this.reported.has(key)) {
            return;
        }
        this.reported.add(key);
        console.warn(`[${this.source}] Dropped ${frame.Kind} input of type ${mimeType}: ${this.reason}.`);
    }
}
