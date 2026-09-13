import { createDisplayName } from "@memberjunction/global";

/**
 * Short words that are legitimate English on their own, so a display name
 * containing one is NOT evidence of an unexpanded abbreviation.
 *
 * This list exists to suppress needless LLM calls, not to be exhaustive. A word
 * missing from it costs one wasted call whose result is very likely identical to
 * the mechanical name; a word wrongly ON it costs a missed improvement. The list
 * is therefore kept to words that are unambiguously whole words in a schema
 * context, and errs toward being short.
 */
const COMMON_SHORT_WORDS = new Set([
    'add', 'age', 'all', 'and', 'any', 'api', 'app', 'are', 'bio', 'bot', 'box',
    'buy', 'can', 'car', 'cc', 'city', 'code', 'cost', 'data', 'date', 'day',
    'doc', 'due', 'end', 'eta', 'fax', 'fee', 'file', 'for', 'geo', 'has', 'id',
    'ids', 'job', 'key', 'kind', 'lat', 'law', 'link', 'list', 'log', 'long',
    'map', 'max', 'me', 'min', 'mode', 'name', 'net', 'new', 'no', 'note', 'now',
    'num', 'old', 'one', 'own', 'page', 'paid', 'past', 'pay', 'per', 'plan',
    'run', 'row', 'sex', 'sku', 'sms', 'sum', 'tag', 'tax', 'tel', 'the', 'tier',
    'time', 'tip', 'top', 'try', 'two', 'url', 'use', 'user', 'uri', 'via', 'vat',
    'war', 'way', 'web', 'who', 'why', 'win', 'yes', 'zip', 'zone'
]);

/** Vowels, including `y`, which carries a syllable in words like `sync` and `type`. */
const VOWELS = /[aeiouy]/i;

/**
 * Why an entity name was judged opaque (or not). Surfaced so CodeGen can log the
 * reason, and so a reviewer reading the log can tell a deliberate skip from a bug.
 */
export type DisplayNameOpacityReason =
    | 'no-vowel-token'
    | 'short-unknown-token'
    | 'digit-in-token'
    | 'clean';

export interface DisplayNameOpacityResult {
    /** True when the mechanical display name still looks like schema jargon. */
    isOpaque: boolean;

    /** What triggered the verdict. */
    reason: DisplayNameOpacityReason;

    /** The mechanical display name that was judged. */
    mechanicalDisplayName: string;

    /** The specific token that looked opaque, when one did. */
    offendingToken?: string;
}

/**
 * Judges whether an entity name is still opaque after the mechanical
 * `createDisplayName()` pass — that is, whether asking an LLM to rewrite it
 * stands to produce anything the deterministic heuristic could not.
 *
 * This is a COST FILTER, not a correctness gate. `createDisplayName()` already
 * splits underscores, normalizes ALL-CAPS, splits compound words and converts
 * camelCase to spaces, so it handles the common cases outright: `CustomerOrder`
 * becomes `Customer Order` with no model involved. Sending that to an LLM buys
 * nothing but latency and tokens.
 *
 * Where it cannot help is vocabulary. `ACCT_STAT_CD` mechanically becomes
 * `Acct Stat Cd` — correctly spaced, still unreadable — because expanding
 * `Acct` to `Account` requires knowing what the abbreviation means. That is the
 * case worth a model call, and this function is how those cases are spotted.
 *
 * The signals, in order of confidence:
 *
 * 1. **A token with no vowel** (`Mbr`, `Cd`, `Txn`, `Hdr`) — near-certain
 *    abbreviation, since English words need a vowel sound.
 * 2. **A digit inside an alphabetic token** (`Addr2`, `L1Cache`) — a positional
 *    or versioned column whose meaning is rarely self-evident.
 * 3. **A short token not in the common-word list** (`Amt`, `Qty`, `Chg`) — the
 *    weakest signal, and the one the allowlist exists to temper.
 *
 * KNOWN LIMITATION. Four-letter abbreviations that contain a vowel and stand
 * alone — `Addr`, `Dept`, `Prod` — are NOT detected. Widening the short-token
 * rule to length 4 would also catch `Item`, `Type`, `Rate`, `Line` and `Code`,
 * which are whole words appearing in most schemas, so the rule would fire almost
 * everywhere and the filter would stop filtering. Since this trades coverage for
 * cost by design, the `alwaysGenerate` feature option bypasses it entirely for
 * deployments that would rather pay for a thorough pass.
 *
 * @param entityName - The entity's `Name` (typically derived from the table name).
 * @returns The verdict, the mechanical name it judged, and the reason.
 */
export function assessDisplayNameOpacity(entityName: string): DisplayNameOpacityResult {
    const mechanicalDisplayName = createDisplayName(entityName ?? '').trim();

    // Split on whitespace; punctuation from prefixed names ("CRM: Accounts") is
    // stripped so a schema prefix never reads as an abbreviation.
    const tokens = mechanicalDisplayName
        .split(/\s+/)
        .map(t => t.replace(/[^A-Za-z0-9]/g, ''))
        .filter(t => t.length > 0);

    for (const token of tokens) {
        const hasLetter = /[A-Za-z]/.test(token);

        // A purely numeric token carries no vocabulary to expand.
        if (!hasLetter) {
            continue;
        }

        if (!VOWELS.test(token)) {
            return { isOpaque: true, reason: 'no-vowel-token', mechanicalDisplayName, offendingToken: token };
        }

        if (/\d/.test(token)) {
            return { isOpaque: true, reason: 'digit-in-token', mechanicalDisplayName, offendingToken: token };
        }

        if (token.length <= 3 && !COMMON_SHORT_WORDS.has(token.toLowerCase())) {
            return { isOpaque: true, reason: 'short-unknown-token', mechanicalDisplayName, offendingToken: token };
        }
    }

    return { isOpaque: false, reason: 'clean', mechanicalDisplayName };
}

/**
 * Convenience predicate over {@link assessDisplayNameOpacity}.
 */
export function isLikelyOpaqueEntityName(entityName: string): boolean {
    return assessDisplayNameOpacity(entityName).isOpaque;
}
