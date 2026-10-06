import { MJLruCache } from '@memberjunction/global';
import { FINISH_IF_MODES, IsFinishIfMode } from './agent-types/loop-agent-prompt-params';

/** The most characters of a `finishIfMode` value that is not a mode a warning shows. */
export const FINISH_IF_MODE_WARNING_SHOWN_MAX = 100;

/** The most agent and value pairs {@link FinishIfModeWarnings} remembers as already reported. */
export const FINISH_IF_MODE_WARNINGS_REMEMBERED = 1000;

/**
 * Decides when to warn that an agent's merged `finishIfMode` is set but is not one of the
 * {@link FINISH_IF_MODES}: once per agent and value. `ResolveFinishIfMode` treats such a value as
 * `'off'`, so without the warning a typo such as `"On"` or `"true"` would turn the agent's gates
 * off without a word.
 *
 * The value can come from whoever starts a run, through its runtime prompt-param overrides, so
 * both what is logged and what is remembered are bounded:
 * - a warning shows at most {@link FINISH_IF_MODE_WARNING_SHOWN_MAX} characters of the value, and
 *   notes its full length when it is longer;
 * - two values count as the same when their warnings would read the same, so a pair is
 *   remembered by a key of bounded size;
 * - at most `maxRemembered` pairs are remembered, and the one seen least recently is dropped
 *   first. A dropped pair warns again the next time it is seen, which is harmless.
 */
export class FinishIfModeWarnings {
    private readonly reported: MJLruCache<string, true>;

    constructor(maxRemembered: number = FINISH_IF_MODE_WARNINGS_REMEMBERED) {
        this.reported = new MJLruCache<string, true>({ maxSize: maxRemembered });
    }

    /** How many agent and value pairs are remembered as reported. Never more than {@link MaxRemembered}. */
    public get Remembered(): number {
        return this.reported.Size;
    }

    /** The most agent and value pairs remembered at once. */
    public get MaxRemembered(): number {
        return this.reported.MaxSize;
    }

    /**
     * The warning to log for an agent's merged `finishIfMode`, or `undefined` when there is none
     * to log: the value is absent, is a mode, or was reported for this agent already.
     */
    public WarningFor(agentID: string, agentName: string, value: unknown): string | undefined {
        if (value === undefined || value === null || IsFinishIfMode(value)) {
            return undefined;
        }
        const shown = ShowFinishIfModeValue(value);
        const key = `${agentID}\u0000${shown}`;
        // Get also marks the pair as recently seen, so a value an agent keeps sending is not dropped.
        if (this.reported.Get(key)) {
            return undefined;
        }
        this.reported.Set(key, true);
        const modes = FINISH_IF_MODES.map(mode => `'${mode}'`).join(', ');
        return `Agent '${agentName}' has finishIfMode ${shown}, which is not one of ${modes}, so its finishIf gates are off. Mode names are case-sensitive.`;
    }
}

/**
 * A `finishIfMode` value as its warning shows it. A string keeps its quotes, so `"true"` and
 * `true` read differently. Anything else is shown as JSON. Either is cut to
 * {@link FINISH_IF_MODE_WARNING_SHOWN_MAX} characters, and a longer one notes its full length.
 */
export function ShowFinishIfModeValue(value: unknown): string {
    if (typeof value === 'string') {
        // Cut before quoting, so a huge string is never copied whole.
        const cut = value.slice(0, FINISH_IF_MODE_WARNING_SHOWN_MAX);
        return value.length > cut.length ? `${JSON.stringify(cut)}… (${value.length} characters)` : JSON.stringify(cut);
    }
    const json = jsonOf(value);
    return json.length > FINISH_IF_MODE_WARNING_SHOWN_MAX
        ? `${json.slice(0, FINISH_IF_MODE_WARNING_SHOWN_MAX)}… (${json.length} characters as JSON)`
        : json;
}

/** A value as JSON, or as `String(value)` when it cannot be written as JSON. */
function jsonOf(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}
