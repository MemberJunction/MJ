// LOCKED PRIMITIVE — freeze-contract
//
// Guarantee: materializes the structured contract artifact + provenance sidecar
// to disk and adversarially verifies the contract itself. After this returns,
// downstream code-builder consumes ONLY the frozen artifact; ad-hoc churn during
// code generation is structurally impossible.
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
//   { frozenContractHash: string, contractPath: string, sidecarPath: string }

export const meta = {
    name: 'freeze-contract',
    description: 'Materialize contract + provenance sidecar to disk; adversarial-verify the contract itself; emit a content hash.',
    phases: [
        { title: 'serialize', detail: 'JSON-serialize contract + sidecar in canonical order' },
        { title: 'adversarial-self-check', detail: 'adversarial-verify on the contract artifact as a whole' },
        { title: 'persist', detail: 'Write to outputDir; emit content hash' },
    ],
};

const FREEZE_RESULT_SCHEMA = {
    type: 'object',
    required: ['frozenContractHash', 'contractPath', 'sidecarPath'],
    properties: {
        frozenContractHash: { type: 'string' },
        contractPath: { type: 'string' },
        sidecarPath: { type: 'string' },
        adversarialSurvived: { type: 'boolean' },
    },
    additionalProperties: false,
};

phase('serialize');
log(`freeze-contract: vendor=${args?.vendor ?? '(?)'}`);

phase('adversarial-self-check');
phase('persist');

// metadata-writer owns serialization + persistence (the same role that wrote
// the Integration row earlier).  The N-skeptic self-check happens inside the
// agent by recursively invoking adversarial-verify on the assembled contract.
const result = await agent(
    `Serialize and persist the frozen contract for vendor ${args?.vendor ?? '(?)'} to ${args?.outputDir ?? '(?)'}.\n\nCanonical-order JSON for contract + sidecar. Compute SHA-256 of the contract JSON as frozenContractHash. Run adversarial-verify on the contract as a whole (N=${args?.adversarialN ?? 3} skeptics check for internal inconsistencies: slots referenced in the contract but not in provenance, FK targets that don't exist, type mismatches between Integration and IO declarations). Return the structured result.`,
    { agentType: 'metadata-writer', schema: FREEZE_RESULT_SCHEMA, phase: 'persist', label: `freeze:${args?.vendor ?? 'unknown'}` }
);

return result;
