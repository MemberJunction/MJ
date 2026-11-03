/**
 * Two-stage diagnostic scrubber for MemberJunction Diagnostic Bundles.
 *
 * Stage 1 (ALWAYS ON — non-disableable, even in `FullRaw` mode):
 *   - Authorization / Cookie / X-API-Key / Set-Cookie headers, and any `*-token`, `*-key`, `*-secret` header
 *   - Bearer and Basic credentials & 3-part JWTs (`eyJ...`)
 *   - API keys (`sk-...`, `sk-proj-...`, `AKIA...`, `ASIA...`, `ghp_...`, `github_pat_...`, `xoxb-...`, `SG....`, `mj_sk_...`)
 *   - URI credentials (`scheme://user:pass@host` keeps the scheme and host)
 *   - Secret `name=value` pairs, quoted or not (connection strings, query strings, form bodies, env lines)
 *   - Secret JSON (`"password":"..."`, plain or escaped) and `name: value` (header line, YAML) pairs inside strings
 *   - Private key PEM blocks (`-----BEGIN ... PRIVATE KEY-----`)
 *   - Object property names that contain a secret word (`password`, `secret`, `token`, `apiKey`, `credential`, ...),
 *     except token-count names (`maxTokens`, `tokenCount`, `tokenizer`, ...)
 *
 * Stage 2 (OPT-IN / `Standard` mode — customer-controlled via `ScrubLiterals`):
 *   - SQL string, hex & numeric literals (`'...'` -> `?`, numbers -> `?`) in server SQL, query plans,
 *     log messages and filter-like telemetry params (`ExtraFilter`, `OrderBy`, `Filters`, ...)
 *   - Absolute host filesystem paths in stack traces truncated to repo-relative (`packages/...` or `node_modules/...`)
 *   - Custom regex patterns configured by the administrator
 *
 * Every pattern runs in linear time on its input.
 */

import type { DiagnosticBundleData, DiagnosticLogEntry, DiagnosticScrubberProfile } from './types.js';

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

/** Normalized key fragments that mark a key name as a credential wherever they appear in it. */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'apikey',
    'privatekey',
    'accesskey',
    'accountkey',
    'signingkey',
    'encryptionkey',
    'masterkey',
    'sharedkey',
    'credential',
    'signature',
    'connectionstring',
    'connstr',
];

/** Normalized key names that are credentials only as an exact match. */
const SENSITIVE_EXACT_KEYS: ReadonlySet<string> = new Set([
    'authorization',
    'proxyauthorization',
    'cookie',
    'setcookie',
    'sig',
    'pass',
]);

/** Normalized key names that contain a sensitive fragment but hold counts or settings, not secrets. */
const SAFE_KEY_NAMES: ReadonlySet<string> = new Set(['credentialsscrubbedcount', 'tokentype', 'tokens']);

/** Normalized name endings that mark a descriptor of a secret (its kind, version or rules), not the secret itself. */
const SAFE_KEY_SUFFIXES: readonly string[] = ['type', 'version', 'policy'];

/** Normalized name endings whose value is kept only when it is a number. */
const NUMERIC_ONLY_KEY_SUFFIXES: readonly string[] = ['count', 'length'];

/** Text that is a plain number. */
const NUMERIC_TEXT_REGEX = /^-?\d+(?:\.\d+)?$/;

/** Names that end in an `Id` / `ID` word, such as `apiKeyId` or `API_KEY_ID`. */
const SAFE_ID_SUFFIX_REGEX = /(?:Id|ID|[-_.\s][iI][dD])$/;


/** Token-count style names (`maxTokens`, `promptTokens`, `tokenCount`, `tokenizer`, `TokensUsed`). */
const SAFE_TOKEN_KEY_REGEX =
    /^(?:max|min|total|input|output|prompt|completion|cached|reasoning|estimated)*tokens?(?:count|counts|limit|used|usage|prompt|completion|total|izer|estimate|input|output)+$|^(?:max|min|total|input|output|prompt|completion|cached|reasoning|estimated)+tokens?$/;

/** Header-name suffixes that mark a header as a credential. */
const SENSITIVE_HEADER_SUFFIX_REGEX = /-(?:token|key|secret|signature|credentials?)$/i;

const PEM_BEGIN_REGEX = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;

const PEM_END_REGEX = /-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

/** Runs of JWT alphabet characters long enough to hold a header, a payload and a signature. */
const JWT_CANDIDATE_REGEX = /[A-Za-z0-9_.-]{32,}/g;

const BEARER_REGEX = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;

const BASIC_AUTH_REGEX = /\b(Basic\s+)([A-Za-z0-9+/]{8,}={0,2})(?![A-Za-z0-9+/=])/gi;

const KNOWN_API_KEY_REGEX =
    /\b(sk-proj-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|mj_sk_[A-Za-z0-9_-]{12,})\b/g;

/** `scheme://userinfo@` where the user info may hold a password. */
const URI_CREDENTIALS_REGEX = /\b([A-Za-z][A-Za-z0-9+.-]{1,31}:\/\/)([^\s/?#@'"<>]+)@/g;

const CONN_STRING_SECRET_REGEX =
    /\b(Password|Pwd|AccountKey|SharedAccessKey|SharedAccessSignature|SecretAccessKey|ClientSecret)\s*=\s*([^;\s"']+)/gi;

const URL_QUERY_SECRET_REGEX =
    /([?&](?:access_token|refresh_token|id_token|token|api_key|apikey|key|secret|password|sig|signature|code)=)([^&#\s"']+)/gi;

/** `name=` at the start of a pair (query strings, form bodies, env lines, connection strings). */
const KEY_ASSIGNMENT_REGEX = /(^|[^A-Za-z0-9_.-])([A-Za-z][A-Za-z0-9_.-]{0,63})(\s*=\s*)/g;

/** The value after `name=`: quoted (ends at the closing quote or the line end) or a bare token. */
const ASSIGNMENT_VALUE_REGEX = /'(?:''|[^'\r\n])*(?:'|(?=[\r\n])|$)|"(?:""|[^"\r\n])*(?:"|(?=[\r\n])|$)|[^&\s"';,)=]+/y;

/** A quoted value after `name: `; it ends at the closing quote or the line end. */
const LINE_QUOTED_VALUE_REGEX = /"[^"\r\n]*(?:"|(?=[\r\n])|$)|'[^'\r\n]*(?:'|(?=[\r\n])|$)/y;

/** The next line break. */
const LINE_BREAK_REGEX = /[\r\n]/g;

/** `"name": "value"` pairs inside a string. */
const JSON_STRING_PAIR_REGEX = /("([A-Za-z0-9_.-]{1,64})"\s*:\s*)"((?:\\.|[^"\\])*)"/g;

/** `\"name\": \"value\"` pairs inside a JSON-escaped string. */
const ESCAPED_JSON_STRING_PAIR_REGEX = /(\\"([A-Za-z0-9_.-]{1,64})\\"\s*:\s*)\\"([^"]*?)\\"/g;

/** `name: ` at the start of a header line or YAML pair; the value runs to the end of the line. */
const LINE_KEY_REGEX = /(^|[^A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_-]{0,63})([ \t]*:[ \t]*)/g;

/** HTTP auth schemes kept in front of a redacted header value. */
const AUTH_SCHEME_PREFIX_REGEX = /(?:Basic|Bearer|Digest|Negotiate|NTLM|Token|ApiKey|AWS4-HMAC-SHA256)[ \t]+/iy;

/** A value that is exactly one redaction marker. */
const PURE_MARKER_REGEX = /^\[REDACTED_[A-Z_]+\]$/;

const STACK_PATH_PREFIX_REGEX =
    /(?:\(|at\s+)(?:[A-Za-z]:\\|\/)[^\s():]*?[/\\]((packages|node_modules)[/\\][^\s():]+)/g;

/** Longest SQL text normalized; text past it is dropped and replaced by a truncation marker. */
export const MAX_NORMALIZED_SQL_LENGTH = 65_536;

const SQL_SINGLE_QUOTED_LITERAL_REGEX = /N?'(?:''|[^'])*'/g;

const SQL_COMPARISON_NUMBER_REGEX = /(=|<>|!=|<=|>=|<|>)\s*-?\b\d+(?:\.\d+)?\b/g;

const SQL_HEX_LITERAL_REGEX = /(^|[^\w$@#])0x[0-9A-Fa-f]+(?![\w$])/g;

const SQL_NUMBER_LITERAL_REGEX = /(^|[^\w$@#.])\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w$])/g;

/** Start of a full SQL statement inside log text. */
const SQL_STATEMENT_START_REGEX = /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE)\b/;

const TEXT_IN_LIST_REGEX = /(\bIN\s*\()([^()]*)\)/gi;

const TEXT_BETWEEN_REGEX =
    /(\bBETWEEN\s+)(N?'(?:''|[^'])*'|-?\d+(?:\.\d+)?)(\s+AND\s+)(N?'(?:''|[^'])*'|-?\d+(?:\.\d+)?)/gi;

const TEXT_OPERATOR_STRING_REGEX = /((?:=|<>|!=|<=|>=|<|>|\bLIKE)\s*)N?'(?:''|[^'])*(?:'|$)/gi;

/** Showplan XML attributes whose values hold SQL text or literal values. */
const PLAN_LITERAL_ATTRIBUTE_REGEX =
    /(\s(?:StatementText|ScalarString|ConstValue|ParameterCompiledValue|ParameterRuntimeValue)=")([^"]*)"/g;

/** Telemetry param names whose values are SQL filter or sort fragments (normalized names). */
const SQL_FRAGMENT_PARAM_NAMES: ReadonlySet<string> = new Set([
    'extrafilter',
    'filter',
    'filters',
    'orderby',
    'orderbys',
    'sql',
    'whereclause',
]);

/** Telemetry param names whose values are literal record values (normalized names). */
const LITERAL_VALUE_PARAM_NAMES: ReadonlySet<string> = new Set(['afterkey', 'afterkeys', 'usersearchstring']);

/** Running total of credential redactions made during one scrub call. */
interface RedactionTally {
    count: number;
}

/** A Stage 1 credential pattern and the text that replaces each match. */
interface CredentialRule {
    regex: RegExp;
    /** Capture group that holds the secret; 0 means the whole match. */
    secretGroup: number;
    /** Builds the replacement from the match and its capture groups (`groups[0]` is group 1). */
    replace: (groups: string[]) => string;
    /** When given and false, the match is kept unchanged and not counted. */
    applies?: (groups: string[]) => boolean;
}

/** True when a captured key names a credential and its value is not already a redaction marker. */
function sensitivePair(key: string, value: string): boolean {
    return IsSensitiveKeyName(key) && !PURE_MARKER_REGEX.test(value) && !isKeptTextValue(key, value);
}

/** True when `key` ends in `Count` or `Length` (normalized), whose value is kept only when it is a number. */
function isNumericOnlyKey(key: string): boolean {
    const normalized = normalizeKeyName(key);
    return NUMERIC_ONLY_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/** True when a text value under a sensitive key is kept: `true`/`false`, or a number under a Count/Length key. */
function isKeptTextValue(key: string, value: string): boolean {
    const trimmed = value.trim();
    return trimmed === 'true' || trimmed === 'false' || (isNumericOnlyKey(key) && NUMERIC_TEXT_REGEX.test(trimmed));
}

/** Lower-cases a key name and removes `-`, `_`, `.` and spaces. */
function normalizeKeyName(key: string): string {
    return key.trim().toLowerCase().replace(/[-_.\s]/g, '');
}

const CREDENTIAL_RULES: readonly CredentialRule[] = [
    { regex: BEARER_REGEX, secretGroup: 0, replace: (groups) => `${groups[0]}[REDACTED_TOKEN]` },
    {
        regex: BASIC_AUTH_REGEX,
        secretGroup: 2,
        replace: (groups) => `${groups[0]}[REDACTED_TOKEN]`,
        applies: (groups) => /[0-9+/=]/.test(groups[1]),
    },
    { regex: KNOWN_API_KEY_REGEX, secretGroup: 0, replace: () => '[REDACTED_API_KEY]' },
    {
        regex: URI_CREDENTIALS_REGEX,
        secretGroup: 2,
        replace: (groups) => `${groups[0]}[REDACTED_CREDENTIALS]@`,
        applies: (groups) => groups[1].includes(':'),
    },
    { regex: CONN_STRING_SECRET_REGEX, secretGroup: 2, replace: (groups) => `${groups[0]}=[REDACTED_SECRET]` },
    { regex: URL_QUERY_SECRET_REGEX, secretGroup: 2, replace: (groups) => `${groups[0]}[REDACTED_QUERY_PARAM]` },
    {
        regex: JSON_STRING_PAIR_REGEX,
        secretGroup: 3,
        replace: (groups) => `${groups[0]}"[REDACTED_SECRET]"`,
        applies: (groups) => sensitivePair(groups[1], groups[2]),
    },
    {
        regex: ESCAPED_JSON_STRING_PAIR_REGEX,
        secretGroup: 3,
        replace: (groups) => `${groups[0]}\\"[REDACTED_SECRET]\\"`,
        applies: (groups) => sensitivePair(groups[1], groups[2]),
    },
];

const REDACTION_MARKER_PREFIX = '[REDACTED_';

/** Returns the number of capture groups in `regex`. */
function captureGroupCount(regex: RegExp): number {
    const emptyMatch = new RegExp(`${regex.source}|`).exec('');
    return emptyMatch ? emptyMatch.length - 1 : 0;
}

/**
 * Replaces every match of one rule and adds each redaction to `tally`.
 * A match whose secret starts with a marker from an earlier rule is still replaced in full, but not counted again.
 */
function applyCredentialRule(input: string, rule: CredentialRule, tally: RedactionTally): string {
    const groupCount = captureGroupCount(rule.regex);
    return input.replace(rule.regex, (match: string, ...rest: Array<string | number | undefined>) => {
        const groups = rest.slice(0, groupCount).map((g) => (typeof g === 'string' ? g : ''));
        if (rule.applies && !rule.applies(groups)) {
            return match;
        }
        const secret = rule.secretGroup === 0 ? match : groups[rule.secretGroup - 1];
        if (!secret.startsWith(REDACTION_MARKER_PREFIX)) {
            tally.count++;
        }
        return rule.replace(groups);
    });
}

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
 * Returns the index of the first `eyJ` in `segment` that starts a word and has at least 8 characters after it, or -1.
 */
function jwtHeaderStart(segment: string): number {
    let idx = segment.indexOf('eyJ');
    while (idx >= 0) {
        if ((idx === 0 || segment[idx - 1] === '-') && segment.length - idx >= 11) {
            return idx;
        }
        idx = segment.indexOf('eyJ', idx + 1);
    }
    return -1;
}

/**
 * Replaces each `header.payload.signature` JWT inside one dot-separated token with `[REDACTED_JWT]`.
 */
function redactJwtsInToken(token: string, tally: RedactionTally): string {
    const segments = token.split('.');
    const out: string[] = [];
    let i = 0;
    while (i < segments.length) {
        const start = i + 2 < segments.length ? jwtHeaderStart(segments[i]) : -1;
        const isJwt =
            start >= 0 &&
            segments[i + 1].startsWith('eyJ') &&
            segments[i + 1].length >= 11 &&
            segments[i + 2].length >= 8;
        if (isJwt) {
            out.push(segments[i].slice(0, start) + '[REDACTED_JWT]');
            tally.count++;
            i += 3;
        } else {
            out.push(segments[i]);
            i++;
        }
    }
    return out.join('.');
}

/**
 * Replaces each JWT with `[REDACTED_JWT]`. Reads each run of JWT characters once, so it runs in linear time.
 */
function redactJwts(input: string, tally: RedactionTally): string {
    if (!input.includes('eyJ')) {
        return input;
    }
    return input.replace(JWT_CANDIDATE_REGEX, (token: string) =>
        token.includes('.eyJ') ? redactJwtsInToken(token, tally) : token
    );
}

/** Where a redactable value starts and ends, and the text kept in front of it. */
interface KeyedValue {
    end: number;
    keptPrefix: string;
    secret: string;
}

/**
 * Finds each `name<separator>` match of `keyRegex` (group 2 is the name) and, when `isSensitive(name)`,
 * replaces the value that `readValue` finds after it with `[REDACTED_SECRET]`.
 * The scan never re-reads a redacted value and skips only the name when the name is not sensitive,
 * so it runs in linear time and still checks pairs that follow.
 */
function redactKeyedValues(
    input: string,
    keyRegex: RegExp,
    isSensitive: (name: string) => boolean,
    readValue: (input: string, start: number) => KeyedValue | null,
    tally: RedactionTally
): string {
    let out = '';
    let cursor = 0;
    keyRegex.lastIndex = 0;
    let match = keyRegex.exec(input);
    while (match) {
        const valueStart = match.index + match[0].length;
        keyRegex.lastIndex = valueStart;
        const value = isSensitive(match[2]) ? readValue(input, valueStart) : null;
        if (value && value.secret.length > 0) {
            if (!PURE_MARKER_REGEX.test(value.secret) && !isKeptTextValue(match[2], value.secret)) {
                if (!value.secret.startsWith(REDACTION_MARKER_PREFIX)) {
                    tally.count++;
                }
                out += input.slice(cursor, valueStart) + value.keptPrefix + '[REDACTED_SECRET]';
                cursor = value.end;
            }
            keyRegex.lastIndex = value.end;
        }
        match = keyRegex.exec(input);
    }
    return cursor === 0 ? input : out + input.slice(cursor);
}

/** Reads the value of a `name=value` pair. */
function readAssignmentValue(input: string, start: number): KeyedValue | null {
    ASSIGNMENT_VALUE_REGEX.lastIndex = start;
    const value = ASSIGNMENT_VALUE_REGEX.exec(input);
    return value ? { end: start + value[0].length, keptPrefix: '', secret: value[0] } : null;
}

/**
 * Reads the value of a `name: value` header line or YAML pair. A quoted value ends at its closing
 * quote (or the line end); an unquoted value runs to the end of the line. A leading HTTP auth scheme is kept.
 */
function readLineValue(input: string, start: number): KeyedValue | null {
    AUTH_SCHEME_PREFIX_REGEX.lastIndex = start;
    const scheme = AUTH_SCHEME_PREFIX_REGEX.exec(input)?.[0] ?? '';
    const valueStart = start + scheme.length;
    LINE_QUOTED_VALUE_REGEX.lastIndex = valueStart;
    const quoted = LINE_QUOTED_VALUE_REGEX.exec(input);
    if (quoted) {
        return { end: valueStart + quoted[0].length, keptPrefix: scheme, secret: quoted[0] };
    }
    const secret = input.slice(valueStart, lineEnd(input, valueStart)).trimEnd();
    return { end: valueStart + secret.length, keptPrefix: scheme, secret };
}

/** Returns the index of the first line break at or after `from`, or the input length. */
function lineEnd(input: string, from: number): number {
    LINE_BREAK_REGEX.lastIndex = from;
    const lineBreak = LINE_BREAK_REGEX.exec(input);
    return lineBreak ? lineBreak.index : input.length;
}

/**
 * Applies the Stage 1 always-on credential rules and adds each redaction to `tally`.
 */
function redactCredentials(input: string, tally: RedactionTally): string {
    let result = redactPemPrivateKeys(input, tally);
    result = redactJwts(result, tally);
    for (const rule of CREDENTIAL_RULES) {
        result = applyCredentialRule(result, rule, tally);
    }
    result = redactKeyedValues(result, KEY_ASSIGNMENT_REGEX, IsSensitiveKeyName, readAssignmentValue, tally);
    return redactKeyedValues(result, LINE_KEY_REGEX, IsSensitiveHeaderName, readLineValue, tally);
}

/**
 * Checks whether an object key name represents a credential or secret that must always be redacted.
 * Matches secret words anywhere in the name (case-insensitive, ignoring `-`, `_`, `.` and spaces),
 * except for token-count style names such as `maxTokens` or `tokenizer`.
 */
export function IsSensitiveKeyName(key: string): boolean {
    const normalized = normalizeKeyName(key);
    if (!normalized || SAFE_KEY_NAMES.has(normalized) || SAFE_TOKEN_KEY_REGEX.test(normalized)) {
        return false;
    }
    if (SAFE_ID_SUFFIX_REGEX.test(key.trim()) || SAFE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
        return false;
    }
    if (SENSITIVE_EXACT_KEYS.has(normalized)) {
        return true;
    }
    return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Checks whether an HTTP header name carries a credential: a known auth header, a sensitive key name,
 * or a name ending in `-token`, `-key`, `-secret`, `-signature` or `-credential`.
 */
export function IsSensitiveHeaderName(name: string): boolean {
    const trimmed = name.trim();
    return (
        SENSITIVE_HEADER_NAMES.has(trimmed.toLowerCase()) ||
        SENSITIVE_HEADER_SUFFIX_REGEX.test(trimmed) ||
        IsSensitiveKeyName(trimmed)
    );
}

/**
 * Normalizes inline SQL string, hex and numeric literals to `?`.
 * An unterminated string literal is replaced up to the end of the text.
 * Text past {@link MAX_NORMALIZED_SQL_LENGTH} characters is dropped and replaced by a truncation marker.
 * Runs in linear time.
 */
export function NormalizeSqlLiterals(sql: string): string {
    if (!sql) {
        return sql;
    }
    const overflow = sql.length - MAX_NORMALIZED_SQL_LENGTH;
    const head = overflow > 0 ? sql.slice(0, MAX_NORMALIZED_SQL_LENGTH) : sql;
    let out = head.replace(SQL_SINGLE_QUOTED_LITERAL_REGEX, '?');
    const openQuote = out.indexOf("'");
    if (openQuote >= 0) {
        out = out.slice(0, openQuote) + '?';
    }
    out = out.replace(SQL_COMPARISON_NUMBER_REGEX, '$1 ?');
    out = out.replace(SQL_HEX_LITERAL_REGEX, '$1?');
    out = out.replace(SQL_NUMBER_LITERAL_REGEX, '$1?');
    return overflow > 0 ? `${out} /* [SQL_TRUNCATED: ${overflow} more characters] */` : out;
}

/**
 * Normalizes SQL literals inside free text such as log messages.
 * From the first uppercase statement keyword (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `EXEC`)
 * the text is treated as SQL. Before it, only filter literals are replaced: values after comparison
 * operators and `LIKE`, `IN (...)` lists and `BETWEEN ... AND ...` ranges.
 */
export function NormalizeSqlLiteralsInText(text: string): string {
    if (!text) {
        return text;
    }
    const statement = SQL_STATEMENT_START_REGEX.exec(text);
    if (statement) {
        return normalizeFilterLiterals(text.slice(0, statement.index)) + NormalizeSqlLiterals(text.slice(statement.index));
    }
    return normalizeFilterLiterals(text);
}

/** Replaces filter literals in free text; see {@link NormalizeSqlLiteralsInText}. */
function normalizeFilterLiterals(text: string): string {
    if (text.length > MAX_NORMALIZED_SQL_LENGTH) {
        return NormalizeSqlLiterals(text);
    }
    let out = text.replace(TEXT_IN_LIST_REGEX, (_m: string, open: string, inner: string) => `${open}${NormalizeSqlLiterals(inner)})`);
    out = out.replace(TEXT_BETWEEN_REGEX, '$1?$3?');
    out = out.replace(TEXT_OPERATOR_STRING_REGEX, '$1?');
    return out.replace(SQL_COMPARISON_NUMBER_REGEX, '$1 ?');
}

/**
 * Normalizes literals in a query plan. In Showplan XML, only the attributes that carry SQL text or
 * literal values are normalized, so row estimates and costs stay. Other plan text is treated as log text.
 */
export function NormalizePlanLiterals(plan: string): string {
    if (!plan) {
        return plan;
    }
    if (!plan.trimStart().startsWith('<')) {
        return NormalizeSqlLiteralsInText(plan);
    }
    return plan.replace(PLAN_LITERAL_ATTRIBUTE_REGEX, (_m: string, open: string, value: string) => {
        const decoded = value.replace(/&apos;|&#39;/g, "'");
        return `${open}${NormalizeSqlLiterals(decoded)}"`;
    });
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
        if (IsSensitiveHeaderName(k)) {
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
        if (IsSensitiveKeyName(key) && !isKeptObjectValue(key, propVal)) {
            scrubbedRecord[key] = '[REDACTED_KEY]';
            tally.count++;
        } else {
            scrubbedRecord[key] = scrubValueInternal(propVal, optionsOrProfile, seen, depth + 1, tally);
        }
    }
    return scrubbedRecord;
}

/** True when a value under a sensitive key is kept: a boolean, or a number under a Count/Length key. */
function isKeptObjectValue(key: string, value: unknown): boolean {
    return typeof value === 'boolean' || (typeof value === 'number' && isNumericOnlyKey(key));
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
        normalizeBundleLiterals(cloned);
    }

    return { Data: cloned, CredentialsScrubbedCount: tally.count };
}

/**
 * Replaces SQL and filter literals across a bundle: server SQL text and plans, client and server
 * log messages, and filter-like client telemetry params.
 */
function normalizeBundleLiterals(data: DiagnosticBundleData): void {
    data.serverSql = data.serverSql.map((sqlEntry) => ({
        ...sqlEntry,
        sql: NormalizeSqlLiterals(sqlEntry.sql),
        ...(typeof sqlEntry.executionPlanXml === 'string'
            ? { executionPlanXml: NormalizePlanLiterals(sqlEntry.executionPlanXml) }
            : {}),
    }));
    data.clientLogs = data.clientLogs.map((log) => normalizeLogMessage(log));
    data.serverLogs = data.serverLogs.map((log) => normalizeLogMessage(log));
    data.clientTelemetry = data.clientTelemetry.map((event) =>
        event.params ? { ...event, params: normalizeTelemetryParams(event.params) } : event
    );
}

function normalizeLogMessage(log: DiagnosticLogEntry): DiagnosticLogEntry {
    return typeof log.message === 'string' ? { ...log, message: NormalizeSqlLiteralsInText(log.message) } : log;
}

/** Normalizes SQL fragment params and replaces literal-value params with `?`. */
function normalizeTelemetryParams(params: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
        const name = key.toLowerCase().replace(/[-_.\s]/g, '');
        if (SQL_FRAGMENT_PARAM_NAMES.has(name)) {
            out[key] = mapStrings(value, NormalizeSqlLiterals);
        } else if (LITERAL_VALUE_PARAM_NAMES.has(name)) {
            out[key] = mapStrings(value, () => '?');
        } else {
            out[key] = value;
        }
    }
    return out;
}

/** Applies `fn` to a string, or to each string in an array; other values pass through. */
function mapStrings(value: unknown, fn: (text: string) => string): unknown {
    if (typeof value === 'string') {
        return fn(value);
    }
    if (Array.isArray(value)) {
        return value.map((item: unknown) => (typeof item === 'string' ? fn(item) : item));
    }
    return value;
}
