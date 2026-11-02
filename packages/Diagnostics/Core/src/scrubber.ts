/**
 * Two-stage diagnostic scrubber for MemberJunction Diagnostic Bundles.
 *
 * Stage 1 (ALWAYS ON — non-disableable, even in `FullRaw` mode):
 *   - Authorization / Cookie / X-API-Key / Set-Cookie headers
 *   - Bearer tokens & 3-part JWTs (`eyJ...`)
 *   - API keys (`sk-...`, `sk-proj-...`, `AKIA...`, `ASIA...`, `ghp_...`, `github_pat_...`, `xoxb-...`, `SG....`, `mj_sk_...`)
 *   - Connection string secrets (`Password=...`, `Pwd=...`, `AccountKey=...`, `SharedAccessSignature=...`)
 *   - Private key PEM blocks (`-----BEGIN ... PRIVATE KEY-----`)
 *   - Sensitive object property names (`password`, `secret`, `clientSecret`, `apiKey`, `privateKey`, `accessToken`, `refreshToken`, etc.)
 *   - URL query token parameters (`token=`, `code=`, `key=`, `secret=`, `sig=`, `signature=`)
 *
 * Stage 2 (OPT-IN / `Standard` mode — customer-controlled via `ScrubLiterals`):
 *   - Inline SQL string & numeric literals (`'...'` -> `?`, numbers -> `?`)
 *   - Absolute host filesystem paths in stack traces truncated to repo-relative (`packages/...` or `node_modules/...`)
 *   - Custom regex patterns configured by the administrator
 */

import type { DiagnosticBundleData, DiagnosticScrubberProfile } from './types.js';

export interface ScrubOptions {
    scrubberProfile?: DiagnosticScrubberProfile;
    customPatterns?: Array<string | RegExp>;
}

function resolveScrubOptions(optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile): {
    profile: DiagnosticScrubberProfile;
    customRegexes: RegExp[];
} {
    if (!optionsOrProfile) {
        return { profile: 'Standard', customRegexes: [] };
    }
    if (typeof optionsOrProfile === 'string') {
        return { profile: optionsOrProfile, customRegexes: [] };
    }
    const profile = optionsOrProfile.scrubberProfile ?? 'Standard';
    const customRegexes: RegExp[] = [];
    for (const pat of optionsOrProfile.customPatterns ?? []) {
        if (pat instanceof RegExp) {
            customRegexes.push(pat.flags.includes('g') ? pat : new RegExp(pat.source, pat.flags + 'g'));
        } else if (typeof pat === 'string' && pat.length > 0) {
            try {
                customRegexes.push(new RegExp(pat, 'g'));
            } catch {
                // Ignore invalid regex string
            }
        }
    }
    return { profile, customRegexes };
}

const SENSITIVE_HEADER_NAMES: ReadonlySet<string> = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-mj-api-key',
    'x-amz-security-token',
    'x-functions-key',
    'x-csrf-token',
]);

const SENSITIVE_KEY_PATTERN =
    /^(password|passwd|pwd|secret|client_?secret|api_?key|access_?token|refresh_?token|id_?token|private_?key|connection_?string|conn_?str|authorization|cookie|set_?cookie|session_?token|auth_?token|bearer_?token|encryption_?key|signing_?key|master_?key|account_?key|sas_?token)$/i;

const PEM_BEGIN_REGEX = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;

const PEM_END_REGEX = /-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

const BEARER_REGEX = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;

const KNOWN_API_KEY_REGEX =
    /\b(sk-proj-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|mj_sk_[A-Za-z0-9_-]{12,})\b/g;

const CONN_STRING_SECRET_REGEX =
    /\b(Password|Pwd|AccountKey|SharedAccessKey|SharedAccessSignature|SecretAccessKey|ClientSecret)\s*=\s*([^;\s"']+)/gi;

const URL_QUERY_SECRET_REGEX =
    /([?&](?:access_token|refresh_token|id_token|token|api_key|apikey|key|secret|password|sig|signature|code)=)([^&#\s"']+)/gi;

const STACK_PATH_PREFIX_REGEX =
    /(?:\(|at\s+)(?:[A-Za-z]:\\|\/)[^\s():]*?[/\\]((packages|node_modules)[/\\][^\s():]+)/g;

const SQL_SINGLE_QUOTED_LITERAL_REGEX = /N?'(?:''|[^'])*'/g;

const SQL_NUMERIC_COMPARISON_REGEX =
    /(\b(?:WHERE|AND|OR|ON|HAVING|SET|VALUES|LIMIT|OFFSET|TOP)\b[^;]*?(=|<>|!=|<=|>=|<|>|\bIN\s*\(|\bBETWEEN\s+)\s*)-?\b\d+(?:\.\d+)?\b/gi;

/** Running total of credential redactions made during one scrub call. */
interface RedactionTally {
    count: number;
}

/** A Stage 1 credential pattern and the text that replaces each match. */
interface CredentialRule {
    regex: RegExp;
    replace: (match: string, prefix: string) => string;
}

const CREDENTIAL_RULES: readonly CredentialRule[] = [
    { regex: JWT_REGEX, replace: () => '[REDACTED_JWT]' },
    { regex: BEARER_REGEX, replace: (_m, prefix) => `${prefix}[REDACTED_TOKEN]` },
    { regex: KNOWN_API_KEY_REGEX, replace: () => '[REDACTED_API_KEY]' },
    { regex: CONN_STRING_SECRET_REGEX, replace: (_m, name) => `${name}=[REDACTED_SECRET]` },
    { regex: URL_QUERY_SECRET_REGEX, replace: (_m, prefix) => `${prefix}[REDACTED_QUERY_PARAM]` },
];

/**
 * Returns the index just past the first PEM END marker at or after `from`, or -1 if there is none.
 */
function findPemEnd(input: string, from: number): number {
    PEM_END_REGEX.lastIndex = from;
    const end = PEM_END_REGEX.exec(input);
    return end ? end.index + end[0].length : -1;
}

/**
 * Replaces each PEM private-key block with `[REDACTED_PEM_KEY]`.
 * Scans BEGIN and END markers by index, so it runs in linear time on any input.
 */
function redactPemPrivateKeys(input: string, tally: RedactionTally): string {
    let out = '';
    let cursor = 0;
    PEM_BEGIN_REGEX.lastIndex = 0;
    let begin = PEM_BEGIN_REGEX.exec(input);
    while (begin) {
        const blockEnd = findPemEnd(input, begin.index + begin[0].length);
        if (blockEnd < 0) {
            break; // no END after this BEGIN, so no later BEGIN has one either
        }
        out += input.slice(cursor, begin.index) + '[REDACTED_PEM_KEY]';
        tally.count++;
        cursor = blockEnd;
        PEM_BEGIN_REGEX.lastIndex = blockEnd;
        begin = PEM_BEGIN_REGEX.exec(input);
    }
    return cursor === 0 ? input : out + input.slice(cursor);
}

/**
 * Applies the Stage 1 always-on credential rules and adds each redaction to `tally`.
 */
function redactCredentials(input: string, tally: RedactionTally): string {
    let result = redactPemPrivateKeys(input, tally);
    for (const rule of CREDENTIAL_RULES) {
        result = result.replace(rule.regex, (match: string, prefix: string) => {
            tally.count++;
            return rule.replace(match, prefix);
        });
    }
    return result;
}

/**
 * Checks whether an object key name represents a credential or secret that must always be redacted.
 */
export function IsSensitiveKeyName(key: string): boolean {
    const normalized = key.trim().replace(/[-.\s]/g, '_');
    return SENSITIVE_KEY_PATTERN.test(normalized);
}

/**
 * Normalizes inline SQL string and numeric literals to `?`.
 */
export function NormalizeSqlLiterals(sql: string): string {
    if (!sql) {
        return sql;
    }
    let out = sql.replace(SQL_SINGLE_QUOTED_LITERAL_REGEX, '?');
    out = out.replace(/(=|<>|!=|<=|>=|<|>)\s*-?\b\d+(?:\.\d+)?\b/g, '$1 ?');
    out = out.replace(SQL_NUMERIC_COMPARISON_REGEX, '$1?');
    return out;
}

/**
 * Truncates absolute host file paths in stack traces to start at `packages/...` or `node_modules/...`.
 */
export function TruncateStackFramePath(stack: string): string {
    if (!stack) {
        return stack;
    }
    return stack.replace(STACK_PATH_PREFIX_REGEX, (fullMatch, relativePart: string) => {
        const normalizedRel = relativePart.replace(/\\/g, '/');
        if (fullMatch.startsWith('(')) {
            return `(${normalizedRel}`;
        }
        return `at ${normalizedRel}`;
    });
}

export const TruncateStackTracePaths = TruncateStackFramePath;

/** Scrubbed text plus the number of credential redactions made. */
export interface ScrubStringResult {
    Text: string;
    RedactionCount: number;
}

/**
 * Scrubs a string using Stage 1 (always-on credential scrubbing) and optional Stage 2
 * (when `scrubberProfile === 'Standard'`) plus any `customPatterns`.
 */
export function ScrubString(
    input: string,
    optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile
): string {
    return scrubStringTallied(input, optionsOrProfile, { count: 0 });
}

/**
 * Same as {@link ScrubString}, and also returns how many Stage 1 credential redactions it made.
 */
export function ScrubStringWithCount(
    input: string,
    optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile
): ScrubStringResult {
    const tally: RedactionTally = { count: 0 };
    const text = scrubStringTallied(input, optionsOrProfile, tally);
    return { Text: text, RedactionCount: tally.count };
}

function scrubStringTallied(
    input: string,
    optionsOrProfile: ScrubOptions | DiagnosticScrubberProfile | undefined,
    tally: RedactionTally
): string {
    if (!input || typeof input !== 'string') {
        return input;
    }

    const { profile, customRegexes } = resolveScrubOptions(optionsOrProfile);

    // Stage 1: Always-on credential & secret scrubbing
    let result = redactCredentials(input, tally);

    // Stage 2: Stack frame path normalization in Standard mode
    if (profile === 'Standard' && (result.includes('packages/') || result.includes('packages\\') || result.includes('node_modules'))) {
        result = TruncateStackFramePath(result);
    }

    // Custom regex patterns
    for (const pattern of customRegexes) {
        result = result.replace(pattern, '[REDACTED_CUSTOM]');
    }

    return result;
}

/**
 * Scrubs HTTP headers map, always redacting sensitive auth/cookie headers.
 */
export function ScrubHeaders(
    headers: Record<string, string>,
    optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (SENSITIVE_HEADER_NAMES.has(k.toLowerCase().trim())) {
            out[k] = '[REDACTED_HEADER]';
        } else {
            out[k] = ScrubString(v, optionsOrProfile);
        }
    }
    return out;
}

/**
 * Recursively scrubs an arbitrary structured value (logs, telemetry params, contributor payloads).
 * Cycle-safe via `WeakSet` and depth-bounded (max depth 12).
 */
export function ScrubValue<T>(
    value: T,
    optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile
): T {
    const seen = new WeakSet<object>();
    return scrubValueInternal(value, optionsOrProfile, seen, 0, { count: 0 }) as T;
}

function scrubValueInternal(
    value: unknown,
    optionsOrProfile: ScrubOptions | DiagnosticScrubberProfile | undefined,
    seen: WeakSet<object>,
    depth: number,
    tally: RedactionTally
): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'string') {
        return scrubStringTallied(value, optionsOrProfile, tally);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value !== 'object') {
        return String(value);
    }
    if (seen.has(value)) {
        return '[Circular]';
    }
    if (depth > 12) {
        return '[MaxDepthExceeded]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((item) => scrubValueInternal(item, optionsOrProfile, seen, depth + 1, tally));
    }

    const record = value as Record<string, unknown>;
    const scrubbedRecord: Record<string, unknown> = {};
    for (const [key, propVal] of Object.entries(record)) {
        if (IsSensitiveKeyName(key)) {
            scrubbedRecord[key] = '[REDACTED_KEY]';
            tally.count++;
        } else {
            scrubbedRecord[key] = scrubValueInternal(propVal, optionsOrProfile, seen, depth + 1, tally);
        }
    }
    return scrubbedRecord;
}

/** Scrubbed bundle plus the number of credential redactions made across it. */
export interface ScrubBundleDataResult {
    Data: DiagnosticBundleData;
    CredentialsScrubbedCount: number;
}

/**
 * Scrubs an entire `DiagnosticBundleData` payload according to the selected `scrubberProfile` (`Standard` or `FullRaw`).
 */
export function ScrubBundleData(
    data: DiagnosticBundleData,
    optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile
): DiagnosticBundleData {
    return ScrubBundleDataWithCount(data, optionsOrProfile).Data;
}

/**
 * Same as {@link ScrubBundleData}, and also returns how many credential redactions it made
 * (Stage 1 pattern matches plus sensitive-key redactions).
 */
export function ScrubBundleDataWithCount(
    data: DiagnosticBundleData,
    optionsOrProfile?: ScrubOptions | DiagnosticScrubberProfile
): ScrubBundleDataResult {
    const { profile } = resolveScrubOptions(optionsOrProfile);
    const tally: RedactionTally = { count: 0 };
    const cloned = scrubValueInternal(structuredClone(data), optionsOrProfile, new WeakSet<object>(), 0, tally) as DiagnosticBundleData;

    if (profile === 'Standard') {
        cloned.serverSql = cloned.serverSql.map((sqlEntry) => ({
            ...sqlEntry,
            sql: NormalizeSqlLiterals(sqlEntry.sql),
        }));
    }

    return { Data: cloned, CredentialsScrubbedCount: tally.count };
}
