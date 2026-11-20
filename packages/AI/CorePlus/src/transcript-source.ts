import { LogError, type UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/**
 * Context describing a meeting whose transcript is being located or fetched.
 * Decoupled from `VideoProviderBase` because organizations frequently record with
 * a different tool than the conferencing host (for example Fathom/Fireflies on Zoom/Meet).
 */
export interface TranscriptMeetingContext {
    /** Optional MJ Tasks `Meeting.ID` when a meeting record already exists. */
    MeetingID?: string | null;
    /** Meeting title / calendar subject. */
    Title: string;
    /** Scheduled start time. */
    StartsAt: Date;
    /** Scheduled end time. */
    EndsAt: Date;
    /** External video meeting ID (for example Zoom meeting ID or Teams onlineMeetingId). */
    ProviderMeetingID?: string | null;
    /** Video join URL from the calendar event or meeting row. */
    VideoJoinURL?: string | null;
    /** Optional attached file ID (`Meeting.TranscriptFileID`) for file-backed transcript sources. */
    TranscriptFileID?: string | null;
    /** Organizer email address when known. */
    OrganizerEmail?: string | null;
    /** Attendee email addresses when known. */
    AttendeeEmails?: readonly string[];
}

/**
 * Opaque reference to a discovered transcript returned by {@link TranscriptSourceBase.FindTranscript}.
 */
export interface TranscriptReference {
    /** Registered driver key (for example `'ZoomTranscriptSource'`, `'AttachedFileTranscriptSource'`). */
    SourceKey: string;
    /** Provider-specific transcript or recording identifier. */
    ExternalTranscriptID: string;
    /** Optional human-readable label (recording title / filename). */
    Title?: string | null;
    /** Optional source format (`'vtt'`, `'srt'`, `'text'`, `'json'`). */
    Format?: 'vtt' | 'srt' | 'text' | 'json';
    /** Optional duration in seconds when reported by the source. */
    DurationSeconds?: number | null;
    /** Optional ISO timestamp when the transcript became ready. */
    RecordedAtISO?: string | null;
}

/**
 * Fetched transcript payload returned by {@link TranscriptSourceBase.FetchTranscript}.
 */
export interface FetchedTranscript {
    /** Source reference from which this payload was fetched. */
    Reference: TranscriptReference;
    /** Normalized plain-text transcript with speaker labels where available. */
    PlainText: string;
    /** Optional raw source payload (for example raw WebVTT) suitable for archival attachment. */
    RawContent?: string | null;
    /** Optional content MIME type (defaults to `'text/plain'`). */
    ContentType?: string;
    /** Distinct speaker display names extracted from the transcript when available. */
    Speakers?: string[];
}

/**
 * Configuration context passed to {@link TranscriptSourceBase.Initialize}.
 */
export interface TranscriptSourceContext {
    /** Optional `MJ: Credentials` ID supplying OAuth / API tokens for this source. */
    CredentialID?: string | null;
    /** Optional JSON configuration string for non-secret source settings. */
    Configuration?: string | null;
}

/**
 * Plugin base class for meeting transcript providers (Zoom Cloud Recordings, Microsoft Teams,
 * Google Meet, attached files, and third-party recorders such as Fathom/Fireflies/Granola).
 *
 * Subclasses register via `@RegisterClass(TranscriptSourceBase, '<DriverClass>')` and are
 * resolved through {@link ResolveTranscriptSource}.
 */
export abstract class TranscriptSourceBase {
    /** Initializes credentials and non-secret configuration for this source. */
    public abstract Initialize(context: TranscriptSourceContext, contextUser: UserInfo): Promise<void>;

    /** True when the source has valid credentials/settings and can query for transcripts. */
    public abstract get IsConfigured(): boolean;

    /**
     * Checks whether a transcript is available for the given meeting.
     * Returns `null` when no transcript is ready yet (allowing the caller's wake gate to retry).
     */
    public abstract FindTranscript(
        meeting: TranscriptMeetingContext,
        contextUser: UserInfo
    ): Promise<TranscriptReference | null>;

    /**
     * Downloads and normalizes the transcript identified by `reference`.
     */
    public abstract FetchTranscript(
        reference: TranscriptReference,
        contextUser: UserInfo
    ): Promise<FetchedTranscript>;
}

/**
 * Resolves a registered {@link TranscriptSourceBase} plugin by its `ClassFactory` key.
 */
export function ResolveTranscriptSource(driverClass: string | null | undefined): TranscriptSourceBase | null {
    const trimmed = driverClass?.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<TranscriptSourceBase>(
            TranscriptSourceBase,
            trimmed
        );
        if (!instance) {
            LogError(`No TranscriptSourceBase driver is registered under '${trimmed}'.`);
            return null;
        }
        return instance;
    } catch (error) {
        LogError(
            `Failed to instantiate TranscriptSourceBase driver '${trimmed}': ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return null;
    }
}
