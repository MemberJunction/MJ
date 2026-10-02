import { BaseModel } from "./baseModel";
import type { AudioModel, AudioSplitter, SpeechResult, SpeechToTextParams, TranscriptionPiece } from "./baseAudio";

/**
 * Base class for speech-to-text models: recorded audio in, a transcript out. Drivers are resolved
 * through the ClassFactory for `MJ: AI Models` of type `Speech to Text`, keyed by the model
 * vendor's `DriverClass`, and are run by `AISpeechToTextRunner` in `@memberjunction/ai-prompts`.
 *
 * Split from `BaseAudioGenerator`, which also carries text-to-speech. A driver that does both
 * registers against this class and `BaseTextToSpeech` under the same key. Drivers that split
 * oversized audio call {@link TranscribeAudioWithSplitting}.
 */
export abstract class BaseSpeechToText extends BaseModel {
    /**
     * Transcribes the audio in `params.audioData` (or the base 64 `params.audioFile`). On success the
     * transcript is in `SpeechResult.content`, and `SpeechResult.usage` carries the audio duration in
     * `Seconds` when the provider reported one.
     */
    public abstract SpeechToText(params: SpeechToTextParams): Promise<SpeechResult>;

    /** The driver's transcription models. */
    public abstract GetModels(): Promise<AudioModel[]>;

    /** The names of the methods this driver implements. */
    public abstract GetSupportedMethods(): Promise<string[]>;
}

/**
 * Transcribes audio that may exceed a provider's upload ceiling, splitting it first when it does,
 * and joins the pieces back into one transcript and one duration.
 *
 * Pieces are transcribed **sequentially**, not in parallel: transcription providers rate limit by
 * audio-seconds per minute, so firing an hour of audio at once buys nothing but 429s, and a partial
 * failure mid-way would leave a transcript with an unmarked hole in it.
 *
 * The returned `durationSeconds` is the sum across pieces, which is what the provider bills, and is
 * left undefined if ANY piece failed to report one, since a partial sum would understate the bill
 * while looking like a complete answer.
 *
 * A free function rather than a protected method so that `BaseAudioGenerator` (which keeps it as
 * one, for its drivers) can still be assigned to {@link BaseSpeechToText}.
 *
 * @param audio The full audio to transcribe
 * @param maxUploadBytes The provider's hard upload ceiling
 * @param splitTargetBytes Target piece size, below the ceiling to leave room for multipart framing
 * @param splitter Splitter to use for oversized audio; may be null, in which case oversized audio fails
 * @param providerLabel Provider name, used in the size-limit error messages
 * @param transcribeOne Transcribes a single piece already known to be within the ceiling
 */
export async function TranscribeAudioWithSplitting(
    audio: Buffer,
    maxUploadBytes: number,
    splitTargetBytes: number,
    splitter: AudioSplitter | null,
    providerLabel: string,
    transcribeOne: (piece: Buffer) => Promise<TranscriptionPiece>
): Promise<TranscriptionPiece> {
    if (audio.byteLength <= maxUploadBytes) {
        return await transcribeOne(audio);
    }
    if (!splitter) {
        throw new Error(
            `Audio is ${toMB(audio.byteLength)}MB, above ${providerLabel}'s ${limitMB(maxUploadBytes)}MB ` +
                `transcription limit. Assign an AudioSplitter to the Splitter property to transcribe ` +
                `audio this size.`,
        );
    }
    const pieces = await splitter.Split(audio, splitTargetBytes);
    if (pieces.length === 0) {
        throw new Error('The configured AudioSplitter returned no pieces');
    }
    return transcribePieces(pieces, maxUploadBytes, providerLabel, transcribeOne);
}

/** Transcribes split pieces in order and joins their text and durations. */
async function transcribePieces(
    pieces: Buffer[],
    maxUploadBytes: number,
    providerLabel: string,
    transcribeOne: (piece: Buffer) => Promise<TranscriptionPiece>
): Promise<TranscriptionPiece> {
    const transcripts: string[] = [];
    let totalDurationSeconds = 0;
    let everyPieceReportedDuration = true;

    for (const piece of pieces) {
        // A piece the splitter left oversized would fail at the API with a size error naming
        // neither the splitter nor which piece; say so here instead.
        if (piece.byteLength > maxUploadBytes) {
            throw new Error(
                `The configured AudioSplitter produced a ${toMB(piece.byteLength)}MB ` +
                    `piece, above ${providerLabel}'s ${limitMB(maxUploadBytes)}MB limit`,
            );
        }
        const transcribed = await transcribeOne(piece);
        transcripts.push(transcribed.text);
        if (transcribed.durationSeconds == null) {
            everyPieceReportedDuration = false;
        } else {
            totalDurationSeconds += transcribed.durationSeconds;
        }
    }

    return {
        text: transcripts.filter((t) => t.length > 0).join(' '),
        durationSeconds: everyPieceReportedDuration ? totalDurationSeconds : undefined,
    };
}

/** A byte count in MB, to one decimal place, for error messages. */
function toMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
}

/** An upload ceiling in whole MB, for error messages. */
function limitMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(0);
}
