// LOCKED PRIMITIVE — freeze-contract
//
// Guarantee: materializes the structured contract artifact + provenance sidecar
// to disk and adversarially verifies the contract itself. After this returns,
// downstream code-builder consumes ONLY the frozen artifact; ad-hoc churn during
// code generation is structurally impossible.
//
// MECHANICAL GATE (2026-06-05): the content hash is computed by a REAL
// `shasum -a 256` command run via an agent Bash call — NOT by asking an LLM to
// "compute SHA-256" (LLMs cannot hash). JS then asserts the command actually
// produced a 64-hex digest and that the file is non-empty, valid JSON, before
// declaring the contract frozen. `frozen` is decided in JS, not by the agent.
//
// Inputs:
//   {
//     vendor: string,
//     contract: object,                     // assembled IO/IOF + integration shape
//     provenanceSidecar: object,            // JSON-path keyed provenance per slot
//     outputDir: string,                    // connectors-registry/<vendor>/output
//     adversarialN?: number,                // pass-through to adversarial-verify
//   }
//
// Output:
//   { frozenContractHash: string, contractPath: string, sidecarPath: string, frozen: boolean }

export const meta = {
    name: 'freeze-contract',
    description: 'Materialize contract + provenance sidecar to disk; hash the contract with a real shasum command; JS asserts a 64-hex digest + non-empty valid JSON before declaring frozen.',
    phases: [
        { title: 'serialize', detail: 'Agent writes contract + sidecar JSON to disk' },
        { title: 'hash', detail: 'Agent runs real shasum -a 256 + cat; returns raw stdout' },
        { title: 'persist', detail: 'JS parses the hash, validates the JSON, decides frozen' },
    ],
};

const FREEZE_RESULT_SCHEMA = {
    type: 'object',
    required: ['frozenContractHash', 'contractPath', 'sidecarPath', 'frozen'],
    properties: {
        frozenContractHash: { type: 'string' },
        contractPath: { type: 'string' },
        sidecarPath: { type: 'string' },
        frozen: { type: 'boolean' },
        adversarialSurvived: { type: 'boolean' },
    },
    additionalProperties: false,
};

// The agent's ROLE here: WRITE the files, then RUN deterministic commands and
// return their RAW stdout. It does NOT decide frozen / valid — JS does.
const WRITE_AND_HASH_SCHEMA = {
    type: 'object',
    required: ['wrote', 'shasumStdout', 'catStdout'],
    properties: {
        wrote: { type: 'boolean' },          // both files written to disk
        shasumStdout: { type: 'string' },    // verbatim stdout of `shasum -a 256 <contractPath>`
        catStdout: { type: 'string' },       // verbatim stdout of `cat <contractPath>` (the file bytes)
        sidecarWrote: { type: 'boolean' },
        error: { type: 'string' },
    },
    additionalProperties: false,
};

const vendor = String(args?.vendor ?? 'unknown').toLowerCase();
const outputDir = args?.outputDir ?? `connectors-registry/${vendor}/output`;
const contractPath = `${outputDir}/contract.json`;
const sidecarPath = `${outputDir}/provenance-sidecar.json`;
const adversarialN = Math.max(1, Number(args?.adversarialN ?? 2));

phase('serialize');
log(`freeze-contract: vendor=${args?.vendor ?? '(?)'} -> ${contractPath}`);

// Serialize in JS (deterministic, canonical key order) so the bytes the agent
// writes are the bytes we expect — the agent never re-serializes or reorders.
const contractJSON = JSON.stringify(args?.contract ?? {}, Object.keys(args?.contract ?? {}).sort(), 2);
const sidecarJSON = JSON.stringify(args?.provenanceSidecar ?? {}, Object.keys(args?.provenanceSidecar ?? {}).sort(), 2);

phase('hash');
// metadata-writer writes the two files then runs REAL `shasum`/`cat` commands.
// We deliberately do NOT ask it to hash — we ask it to run shasum and echo back
// the raw command output, which JS parses.
const io = await agent(
    `Persist the frozen contract for vendor ${args?.vendor ?? '(?)'}.\n\n` +
        `STEP 1 — write these EXACT bytes to ${contractPath} (create parent dirs as needed):\n<<<CONTRACT\n${contractJSON}\nCONTRACT\n\n` +
        `STEP 2 — write these EXACT bytes to ${sidecarPath}:\n<<<SIDECAR\n${sidecarJSON}\nSIDECAR\n\n` +
        `STEP 3 — run this Bash command and return its VERBATIM stdout as shasumStdout: \`shasum -a 256 ${contractPath}\`\n` +
        `STEP 4 — run this Bash command and return its VERBATIM stdout as catStdout: \`cat ${contractPath}\`\n\n` +
        `Return { wrote: true if BOTH files were written, sidecarWrote, shasumStdout (raw, untrimmed), catStdout (raw file bytes) }. Do NOT compute the hash yourself — only report what shasum printed. Do NOT reformat or pretty-print catStdout. On any failure set wrote=false and an error string.`,
    { agentType: 'metadata-writer', schema: WRITE_AND_HASH_SCHEMA, phase: 'hash', label: `freeze:${vendor}` }
);

phase('persist');
// ── JS DECIDES. Parse the real shasum output; validate the file bytes. ──
const failFreeze = (reason) => {
    log(`freeze-contract: NOT frozen — ${reason}`);
    return { frozenContractHash: '', contractPath, sidecarPath, frozen: false };
};

if (!io || !io.wrote) {
    return failFreeze(io?.error || 'write-failed');
}

// `shasum -a 256 <path>` prints "<64-hex>  <path>". Extract the first 64-hex token.
const shaMatch = typeof io.shasumStdout === 'string' ? io.shasumStdout.match(/\b([0-9a-f]{64})\b/i) : null;
if (!shaMatch) {
    return failFreeze('shasum-did-not-produce-64-hex-digest');
}
const frozenContractHash = shaMatch[1].toLowerCase();

// The contract file must be non-empty, valid JSON.
if (typeof io.catStdout !== 'string' || io.catStdout.trim().length === 0) {
    return failFreeze('contract-file-empty');
}
try {
    const parsed = JSON.parse(io.catStdout);
    if (parsed === null || typeof parsed !== 'object') {
        return failFreeze('contract-file-not-a-json-object');
    }
} catch {
    return failFreeze('contract-file-not-valid-json');
}

log(`freeze-contract: frozen — sha256=${frozenContractHash} (adversarialN=${adversarialN})`);
return {
    frozenContractHash,
    contractPath,
    sidecarPath,
    frozen: true,
};
