// LOCKED PRIMITIVE — scrub-fixture
//
// Guarantee: any test-result/fixture payload that crosses the result boundary into
// a subagent's context is stripped of credentials + PII *deterministically* — no LLM
// in the scrub path (an LLM can't be trusted to reliably redact, and sending it the
// raw secret to "decide" already leaks it). The scrub is pure set-of-rules text
// transformation; it preserves structure (keys, array lengths, value *shapes*) so the
// testing-agent can still assert on counts/1:1/non-empty, but never sees a real secret
// or a real person's data.
//
// Why this exists: the credential broker keeps the secret out of agent context on the
// WRITE path (agent passes ENV-VAR names, broker dereferences). But the READ path —
// the IntegrationGetRun payload, the DB count rows, the progress.jsonl events the
// testing-agent inspects to prove a sync landed — can echo back a synced record's
// email/phone, or a header carrying the bearer token. scrub-fixture runs at that
// boundary BEFORE the result enters the agent's context.
//
// Inputs:
//   {
//     fixture: unknown,                 // the object/array/string to scrub (a run payload, DB rows, event)
//     extraKeyPatterns?: string[],      // additional case-insensitive key regexes to treat as credential-bearing
//     extraValuePatterns?: [string,string][], // additional [label, regex] value redactions
//     preserveKeys?: string[],          // exact keys never scrubbed even if they match (e.g. 'RecordCount')
//     maxDepth?: number                 // recursion guard (default 64)
//   }
//
// Output:
//   {
//     scrubbed: unknown,                // same shape, sensitive leaves replaced with '[REDACTED:<reason>]'
//     redactions: { path: string, reason: string }[],  // every redaction, by JSON path — provenance of the scrub
//     redactionCount: number,
//     credentialRedactions: number,
//     piiRedactions: number
//   }
//
// Honesty: the redactions[] array IS the proof of what was scrubbed — the testing-agent
// (and floor-check) can assert the scrub ran and see, by path, that a value existed and
// was removed, without ever seeing the value. A '[REDACTED:credential]' placeholder is an
// honest "a secret was here", not a fabricated empty.

export const meta = {
    name: 'scrub-fixture',
    description: 'Deterministic credential + PII redaction at the result boundary. No LLM in the scrub path; structure preserved; every redaction reported by path.',
    phases: [{ title: 'scrub', detail: 'Recursive rule-based redaction of credential-bearing keys + PII value patterns' }],
};

phase('scrub');

// ── Credential-bearing KEY patterns ─────────────────────────────────────
// When an object key matches one of these, its entire string value is redacted
// regardless of content (the value IS a secret by virtue of the key).
const CREDENTIAL_KEY_PATTERNS = [
    /api[-_ ]?key/i,
    /\bsecret\b/i,
    /client[-_ ]?secret/i,
    /access[-_ ]?token/i,
    /refresh[-_ ]?token/i,
    /\btoken\b/i,
    /\bpassword\b/i,
    /\bpasswd\b/i,
    /\bpwd\b/i,
    /authorization/i,
    /\bbearer\b/i,
    /x[-_]mj[-_]api[-_]key/i,
    /private[-_ ]?key/i,
    /connection[-_ ]?string/i,
    /\bcredential\b/i,
];

// ── PII / secret VALUE patterns ─────────────────────────────────────────
// Applied to every string value (and any string under a non-credential key).
// [label, regex] — the matched span is replaced with '[REDACTED:<label>]'.
const VALUE_PATTERNS = [
    ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
    ['bearer', /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi],
    ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
    ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
    ['credit-card', /\b(?:\d[ -]?){13,16}\b/g],
    // E.164-ish / NANP phone numbers (kept conservative to avoid eating IDs/counts)
    ['phone', /(?<![\w.])\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w.])/g],
];

const extraKeyPatterns = (Array.isArray(args?.extraKeyPatterns) ? args.extraKeyPatterns : [])
    .map((p) => new RegExp(p, 'i'));
const extraValuePatterns = (Array.isArray(args?.extraValuePatterns) ? args.extraValuePatterns : [])
    .map(([label, p]) => [label, new RegExp(p, 'g')]);
const preserveKeys = new Set((Array.isArray(args?.preserveKeys) ? args.preserveKeys : []).map(String));
const MAX_DEPTH = Number.isInteger(args?.maxDepth) ? args.maxDepth : 64;

const allKeyPatterns = [...CREDENTIAL_KEY_PATTERNS, ...extraKeyPatterns];
const allValuePatterns = [...VALUE_PATTERNS, ...extraValuePatterns];

const redactions = [];
let credentialRedactions = 0;
let piiRedactions = 0;

const isCredentialKey = (key) => key != null && allKeyPatterns.some((re) => re.test(String(key)));

const scrubString = (value, path) => {
    let out = String(value);
    for (const [label, re] of allValuePatterns) {
        out = out.replace(re, () => {
            redactions.push({ path, reason: label });
            piiRedactions++;
            return `[REDACTED:${label}]`;
        });
    }
    return out;
};

const walk = (value, path, depth) => {
    if (depth > MAX_DEPTH) return '[REDACTED:max-depth]';
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
        return value.map((v, i) => walk(v, `${path}[${i}]`, depth + 1));
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const childPath = path ? `${path}.${k}` : k;
            if (!preserveKeys.has(k) && isCredentialKey(k)) {
                // Whole value is a credential — redact regardless of type, preserving that *something* was here.
                redactions.push({ path: childPath, reason: 'credential' });
                credentialRedactions++;
                out[k] = '[REDACTED:credential]';
            } else if (typeof v === 'string') {
                out[k] = preserveKeys.has(k) ? v : scrubString(v, childPath);
            } else {
                out[k] = walk(v, childPath, depth + 1);
            }
        }
        return out;
    }
    if (typeof value === 'string') {
        return scrubString(value, path);
    }
    // numbers, booleans, bigint — non-secret scalars pass through (shape preserved)
    return value;
};

const scrubbed = walk(args?.fixture, '', 0);

log(`scrub-fixture: ${redactions.length} redactions (${credentialRedactions} credential, ${piiRedactions} PII)`);

return {
    scrubbed,
    redactions,
    redactionCount: redactions.length,
    credentialRedactions,
    piiRedactions,
};
