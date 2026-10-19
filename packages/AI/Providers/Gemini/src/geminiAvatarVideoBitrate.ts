/**
 * @fileoverview The video bitrate a Gemini Live avatar session asks Google for (`avatarConfig.videoBitrateBps`), and the
 * deployment setting that changes it.
 *
 * MJ asks for 2 Mbps: Google's sample avatar streams run at about 8.5 Mbps, and MJAPI relays the avatar to the browser.
 * The field is in `@google/genai`'s types but not on Google's pages, so a deployment can change the number, or leave the
 * field out and let Google choose, without a rebuild: `MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS` (bits per second; `0` leaves
 * the field out). It is read each time a session's connect config is built, so a restart of the server applies it to the
 * browser mint, the relay's setup and server-side (meeting) sessions alike.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */

/** The environment variable that sets the avatar's video bitrate, in bits per second (`0` leaves the field out). */
export const GEMINI_AVATAR_VIDEO_BITRATE_ENV = 'MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS';

/** The bitrate MJ asks for when the variable is unset or not a whole number: 2 Mbps. */
export const GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT = 2_000_000;

/** The longest part of an unusable value quoted in the log line. */
const MAX_QUOTED_CHARS = 40;

/** Unusable values already reported, so each is logged once per process. */
const reportedValues = new Set<string>();

/**
 * The video bitrate for a Gemini Live avatar session's `avatarConfig.videoBitrateBps`, or `null` to leave the field out.
 *
 * - Unset or blank: {@link GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT}.
 * - `0`: `null`, so Google uses its own bitrate.
 * - A whole number of bits per second: that number.
 * - Anything else: the default, with one log line per such value.
 *
 * @param env The environment to read; the process's by default.
 */
export function ResolveGeminiAvatarVideoBitrateBps(env: Readonly<Record<string, string | undefined>> = processEnvironment()): number | null {
    const raw = env[GEMINI_AVATAR_VIDEO_BITRATE_ENV]?.trim() ?? '';
    if (raw.length === 0) {
        return GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT;
    }
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (Number.isSafeInteger(value)) {
        return value === 0 ? null : value;
    }
    reportUnusable(raw);
    return GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT;
}

/** One log line per unusable value, quoting it shortened and with only printable characters. */
function reportUnusable(raw: string): void {
    if (reportedValues.has(raw)) {
        return;
    }
    reportedValues.add(raw);
    const shown = raw.replace(/[^\x20-\x7E]/g, '?').slice(0, MAX_QUOTED_CHARS);
    console.warn(
        `[GeminiRealtime] ${GEMINI_AVATAR_VIDEO_BITRATE_ENV} "${shown}" is not a whole number of bits per second; avatar sessions ask for ` +
            `${GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT}. Set a number such as 2000000; 0 leaves the field out.`
    );
}

/** The process's environment, or none on a runtime without `process`. */
function processEnvironment(): Readonly<Record<string, string | undefined>> {
    return typeof process !== 'undefined' && process.env ? process.env : {};
}
