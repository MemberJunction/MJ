/**
 * credentialAbsence — classify an error/reason message as an EXPLICIT credential-ABSENCE signal.
 *
 * Consumed by T3 (doc self-check) to decide whether a credential-free discovery failure is an
 * honest "this connector's discovery is a credential-GATED runtime mechanism, so it cannot
 * self-check credential-free" (→ Skip, proven later at the live tier) versus a genuine
 * credential-free-discovery defect (→ Fail).
 *
 * #H14 NARROWING (binding): this returns true ONLY for an EXPLICIT statement that NO credential
 * was provided / configured — e.g. "No credential or Configuration JSON found on
 * CompanyIntegration", "no API key configured", "credential required". It MUST NOT match a
 * generic auth failure — `401`, `Unauthorized`, `invalid token`, `authentication failed`,
 * `access denied`, `forbidden` — because those mean credential-free discovery was implemented
 * WRONG (the T3-deadlock class) and must FAIL, not be waved through as a Skip.
 *
 * Fail-closed: when in doubt, return false. Mis-classifying a real failure as "absence" is the
 * exact bug this narrowing removes; the cost of a false negative (a true absence read as a
 * failure) is merely a louder-than-necessary red, which is the safe direction.
 */

/**
 * Wrong-credential / real-auth-failure markers. If ANY is present the message describes an
 * invalid/expired/denied credential (a real failure), NOT a pure absence — so we refuse to
 * classify it as absence regardless of any absence-shaped wording elsewhere in the string.
 */
const REAL_FAILURE_MARKERS: RegExp[] = [
    /\binvalid\b/i,
    /\bexpired\b/i,
    /\bincorrect\b/i,
    /\brejected\b/i,
    /\brevoked\b/i,
    /\bdenied\b/i,
    /\bunauthori[sz]ed\b/i,
    /\bforbidden\b/i,
    /\bauthentication failed\b/i,
    /\bauth(?:entication)? error\b/i,
    /\b40[13]\b/,
];

/**
 * Explicit absence patterns: a none/missing/required/not-provided/not-configured/not-found
 * qualifier co-located with a credential noun (credential / token / api key / secret /
 * configuration json).
 */
const ABSENCE_PATTERNS: RegExp[] = [
    /\bno\s+(?:credential|credentials|api[\s-]?key|token|access[\s-]?token|secret)\b/i,
    /\b(?:credential|credentials|api[\s-]?key|token|access[\s-]?token|secret)\s+(?:is\s+|was\s+)?(?:required|missing|not\s+(?:set|found|provided|configured|supplied))\b/i,
    /\bno\s+credential\s+or\s+configuration\s+json\s+found\b/i,
    /\bno\s+configuration\s+json\s+found\b/i,
    /\b(?:credential|api[\s-]?key|token)\s+not\s+configured\b/i,
    /\brequires?\s+(?:a\s+)?credential\b/i,
    /\bmissing\s+(?:required\s+)?(?:credential|api[\s-]?key|token|configuration)\b/i,
];

/**
 * @returns true IFF `message` is an explicit "no credential was provided/configured" signal AND
 * carries no wrong-credential / real-auth-failure marker.
 */
export function isExplicitCredentialAbsence(message: string): boolean {
    const msg = (message ?? '').trim();
    if (!msg) return false;
    if (REAL_FAILURE_MARKERS.some((re) => re.test(msg))) return false;
    return ABSENCE_PATTERNS.some((re) => re.test(msg));
}
