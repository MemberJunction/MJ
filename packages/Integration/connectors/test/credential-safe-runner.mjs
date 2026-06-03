/**
 * Credential-safe connector test runner — THE ONLY PLACE CREDENTIALS ARE DEREFERENCED.
 *
 * Callers (a human launching the test under `sudo`, or the connector-builder
 * testing-agent) pass only the env-var NAMES of the secrets — never the values. This
 * runner:
 *   1. Reads the named secrets from process.env (by name).
 *   2. Builds a scrubber over their values and wraps console.* so NOTHING printed
 *      during the run — including the connector's own logs or a thrown error that
 *      happens to embed the token — can leak a secret value.
 *   3. Runs the caller's test plan and returns a structured result with every secret
 *      value scrubbed.
 *
 * Why this is the credential-safe channel for BOTH the manual test and the agent:
 *   - Manual: you keep the token in a root-owned 600 file and launch this under sudo
 *     (`sudo bash -c 'set -a; . /etc/mj-hubspot.env; set +a; exec node hubspot-live-test.mjs'`).
 *     The token lives only in the process you launch; Claude's shell never has it.
 *   - Agent: the testing-agent spawns this as a subprocess and is given only the env-var
 *     NAMES; the values are injected by an out-of-band runner the agent does not control.
 *     The agent reads the JSON result (token-free). This is the realization of the plan's
 *     "mcp-mj-test-runner credential-safe channel — agent passes an opaque reference, the
 *     subprocess dereferences in isolation, results return without credential bytes
 *     entering the conversation."
 */

/** Build a function that replaces every secret value occurrence with a redaction marker. */
function makeScrubber(secretValues) {
    const vals = secretValues.filter(v => typeof v === 'string' && v.length > 0);
    return (s) => {
        if (typeof s !== 'string') return s;
        let out = s;
        for (const v of vals) out = out.split(v).join('***REDACTED***');
        return out;
    };
}

/** Recursively scrub strings in a JSON-able value. */
function scrubDeep(value, scrub) {
    if (typeof value === 'string') return scrub(value);
    if (Array.isArray(value)) return value.map(v => scrubDeep(v, scrub));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, scrub);
        return out;
    }
    return value;
}

/**
 * @param {object} opts
 * @param {Record<string,string>} opts.secrets  logicalName -> ENV_VAR_NAME (values read here, never logged)
 * @param {(values: Record<string,string>, scrub: (s:string)=>string) => Promise<any>} opts.run
 * @returns {Promise<any>} structured, fully-scrubbed result ({ ok, ... } or { ok:false, error })
 */
export async function runCredentialSafe({ secrets, run }) {
    const values = {};
    const missing = [];
    for (const [name, envVar] of Object.entries(secrets)) {
        const v = process.env[envVar];
        if (!v) missing.push(envVar);
        else values[name] = v;
    }
    if (missing.length > 0) {
        return { ok: false, error: `Missing required env var(s): ${missing.join(', ')}. Provide them in the launching process only.` };
    }

    const scrub = makeScrubber(Object.values(values));

    // Route ALL captured console output to STDERR, scrubbed — so STDOUT is reserved for the single
    // final JSON result line. A parent process (the broker) can then capture a clean result from
    // stdout while the scrubbed logs still stream on stderr.
    const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
    const toErr = (...args) => process.stderr.write(args.map(a => (typeof a === 'string' ? scrub(a) : JSON.stringify(scrubDeep(a, scrub)))).join(' ') + '\n');
    console.log = toErr; console.info = toErr; console.debug = toErr; console.warn = toErr; console.error = toErr;

    try {
        const result = await run(values, scrub);
        return scrubDeep(result ?? { ok: true }, scrub);
    } catch (e) {
        return { ok: false, error: scrub(e instanceof Error ? (e.stack ?? e.message) : String(e)) };
    } finally {
        Object.assign(console, orig);
    }
}
