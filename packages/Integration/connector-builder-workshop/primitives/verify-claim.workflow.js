// LOCKED PRIMITIVE — verify-claim
//
// Guarantee: a claim only "exists" in the contract if its provenance script
// reproduces against the pinned source. Hallucination and staleness are
// structurally caught.
//
// MECHANICAL GATE (2026-06-05): the verified/not-verified DECISION is computed in
// JS, NOT returned by an LLM. The agent is used ONLY to EXECUTE the claim's
// extraction script (a Bash call) against the pinned source and return its raw
// stdout/exitCode. JS then normalizes and compares the reproduced value to
// claim.value and sets `verified`. The LLM never judges the verdict.
//
// Inputs (via `args`):
//   {
//     claim: {
//       slot: string,                // Phase 0 slot ID (e.g. "IntegrationObject.APIPath")
//       value: unknown,              // the claimed value
//       extractionScript: string,    // POSIX shell / node snippet that reproduces value
//       sourcePath: string,          // URL or attachment path (pinned)
//     }
//   }
//
// Output schema (returned via `StructuredOutput`):
//   {
//     verified: boolean,
//     actualValue?: unknown,
//     mismatch?: { expected: unknown, actual: unknown, reason: string },
//   }

export const meta = {
    name: 'verify-claim',
    description: 'Re-runs the extraction script for a claim against the pinned source via a Bash agent; JS (not the LLM) compares the reproduced stdout to the claimed value and decides verified.',
    phases: [
        { title: 'fetch-source', detail: 'Re-fetch URL or re-read attachment' },
        { title: 'reproduce', detail: 'Run the extraction script via an agent Bash call; capture raw stdout' },
        { title: 'assert', detail: 'Compare reproduced value to claimed value IN JS' },
    ],
};

const VERIFY_CLAIM_SCHEMA = {
    type: 'object',
    required: ['verified'],
    properties: {
        verified: { type: 'boolean' },
        actualValue: {},
        mismatch: {
            type: 'object',
            properties: {
                expected: {},
                actual: {},
                reason: { type: 'string' },
            },
        },
    },
    additionalProperties: false,
};

// Schema for the agent's ROLE here: a dumb script-runner. It returns raw bytes +
// exit code only. It does NOT return a pass/fail — JS does that.
const RUN_RESULT_SCHEMA = {
    type: 'object',
    required: ['ran', 'exitCode', 'stdout'],
    properties: {
        ran: { type: 'boolean' },        // false if no script / source unreachable / could not execute
        exitCode: { type: 'integer' },   // process exit code of the extraction script
        stdout: { type: 'string' },      // raw stdout, verbatim, no interpretation
        stderr: { type: 'string' },
        unreachableReason: { type: 'string' }, // populated when ran=false
    },
    additionalProperties: false,
};

// Normalize a value to a canonical string for comparison. Strings/numbers/bools
// collapse to a trimmed string; objects/arrays to canonical JSON. This is the
// "string/number normalize" the audit asked for — done in JS, deterministically.
const normalize = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v).trim();
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
};

phase('fetch-source');
const claim = args?.claim ?? {};
log(`verify-claim invoked for slot ${claim.slot ?? '(none)'}`);

// No script to run → cannot reproduce → verified=false (decided in JS, no agent).
if (!claim.extractionScript || typeof claim.extractionScript !== 'string' || !claim.sourcePath) {
    phase('reproduce');
    phase('assert');
    return {
        verified: false,
        mismatch: {
            expected: claim.value,
            actual: null,
            reason: !claim.extractionScript ? 'no-extraction-script' : 'no-source-path',
        },
    };
}

phase('reproduce');
// Agent ONLY executes — it is told NOT to judge, only to run and report raw bytes.
const run = await agent(
    `You are a NON-JUDGING script runner. Execute the following extraction script EXACTLY as given against the pinned source ${claim.sourcePath}. Do NOT evaluate whether the output is "correct" — that decision is made downstream in code. Run it via Bash and return ONLY: ran (true if the process executed at all), exitCode, stdout (verbatim, untrimmed, no commentary), stderr.\n\nEXTRACTION SCRIPT:\n${claim.extractionScript}\n\nIf the source is unreachable (network error, file missing) or the script cannot be executed at all, return ran=false, exitCode=-1, stdout='', and a one-line unreachableReason. NEVER fabricate stdout. NEVER add explanation to stdout.`,
    { schema: RUN_RESULT_SCHEMA, phase: 'reproduce', label: `verify:${claim.slot ?? '(none)'}` }
);

phase('assert');
// ── JS DECIDES. The agent's stdout is raw evidence; we compare here. ──
if (!run || !run.ran) {
    return {
        verified: false,
        mismatch: {
            expected: claim.value,
            actual: null,
            reason: run?.unreachableReason || 'source-unreachable',
        },
    };
}

if (typeof run.exitCode === 'number' && run.exitCode !== 0) {
    return {
        verified: false,
        actualValue: run.stdout,
        mismatch: {
            expected: claim.value,
            actual: run.stdout,
            reason: `extraction-script-nonzero-exit:${run.exitCode}`,
        },
    };
}

const expected = normalize(claim.value);
const actual = normalize(run.stdout);
const verified = expected === actual;

if (verified) {
    return { verified: true, actualValue: run.stdout };
}

return {
    verified: false,
    actualValue: run.stdout,
    mismatch: {
        expected: claim.value,
        actual: run.stdout,
        reason: 'reproduced-value-differs',
    },
};
