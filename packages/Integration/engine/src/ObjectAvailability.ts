/**
 * An object the vendor's catalog names but THIS account cannot serve.
 *
 * The distinction matters because the two look identical at the transport: a connector asking for a
 * record type the account has not enabled gets the same 400 every run, forever. Treated as a fetch
 * error it costs a request, an error event and a retry ladder per object per run — 71 such objects
 * on one live connection produced 71 hard failures every single sync — while telling the operator
 * nothing new after the first time.
 *
 * It is deliberately NOT modelled by disabling the entity map. `SyncEnabled`/`Status` are the USER's
 * levers; writing to them conflates "this account cannot serve the object" with "the user does not
 * want it", and a later re-enable by the user would race the engine. Instead the fact is recorded on
 * the map's Configuration as a marker with a recheck clock: quiet while fresh, self-healing when the
 * account changes, and reversible without anyone having to remember it was set.
 */

/** Marker persisted on `CompanyIntegrationEntityMap.Configuration.objectUnavailable`. */
export interface ObjectUnavailableMarker {
    /** When the object first reported itself unavailable (ISO). Never overwritten while it persists. */
    firstSeenAt: string;
    /** When availability was last actually tested against the vendor (ISO). */
    lastCheckedAt: string;
    /** The vendor's own words, kept so the operator can see WHY without re-running anything. */
    message: string;
}

/** How long a marker suppresses fetches before the next attempt is allowed to re-test it. */
export const DEFAULT_UNAVAILABLE_RECHECK_MS = 24 * 60 * 60 * 1000;

/** The recheck window, operator-tunable; falls back to the default on anything unusable. */
export function UnavailableRecheckMs(env: NodeJS.ProcessEnv = process.env): number {
    const raw = parseInt(env.MJ_INTEGRATION_OBJECT_UNAVAILABLE_RECHECK_MS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UNAVAILABLE_RECHECK_MS;
}

/**
 * Decides whether to skip fetching an object outright, from its persisted marker alone.
 *
 * Pure so the policy is testable without a run: the interesting cases are all clock- and
 * corruption-shaped, and none of them should require a live connector to exercise.
 */
export function DecideUnavailableSkip(
    configurationJSON: string | null | undefined,
    nowMs: number,
    recheckMs: number = DEFAULT_UNAVAILABLE_RECHECK_MS
): { skip: boolean; marker?: ObjectUnavailableMarker } {
    if (!configurationJSON) return { skip: false };
    let parsed: unknown;
    try {
        parsed = JSON.parse(configurationJSON);
    } catch {
        // Malformed Configuration is not evidence of anything — fetch, exactly as before.
        return { skip: false };
    }
    if (!parsed || typeof parsed !== 'object') return { skip: false };
    const marker = (parsed as { objectUnavailable?: unknown }).objectUnavailable;
    if (!marker || typeof marker !== 'object') return { skip: false };
    const { firstSeenAt, lastCheckedAt, message } = marker as Partial<ObjectUnavailableMarker>;
    if (typeof lastCheckedAt !== 'string') return { skip: false };
    const checkedMs = Date.parse(lastCheckedAt);
    // An unparseable or future-dated clock must never suppress a fetch indefinitely: when the
    // marker cannot be trusted, the attempt IS the recheck.
    if (!Number.isFinite(checkedMs) || checkedMs > nowMs) return { skip: false };
    if (nowMs - checkedMs >= recheckMs) return { skip: false };
    return {
        skip: true,
        marker: {
            firstSeenAt: typeof firstSeenAt === 'string' ? firstSeenAt : lastCheckedAt,
            lastCheckedAt,
            message: typeof message === 'string' ? message : 'the source reported this object as unavailable',
        },
    };
}

/**
 * Merges (or clears) the marker on an entity map's Configuration JSON, preserving every other key.
 * Returns the JSON to persist, or null when the map should carry no Configuration at all.
 */
export function ApplyUnavailableMarker(
    configurationJSON: string | null | undefined,
    marker: ObjectUnavailableMarker | null
): string | null {
    let base: Record<string, unknown> = {};
    if (configurationJSON) {
        try {
            const parsed = JSON.parse(configurationJSON);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed as Record<string, unknown>;
        } catch {
            // Unreadable Configuration is replaced rather than propagated — but only ever by a
            // document containing this marker, never by an empty one that would drop real settings
            // we simply could not read.
            base = {};
        }
    }
    if (marker) base.objectUnavailable = marker;
    else delete base.objectUnavailable;
    if (Object.keys(base).length === 0) return null;
    return JSON.stringify(base);
}
