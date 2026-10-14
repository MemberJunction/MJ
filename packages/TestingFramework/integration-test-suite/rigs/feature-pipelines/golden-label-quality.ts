/**
 * golden-label-quality.ts — feature-pipeline rig: labels every golden case with labelers B (OpenAI) and C (Google)
 * under the written guide, adjudicates against labeler A, and writes the golden set with its label-quality record.
 * The logic, the budget rule and the checkpoint rule are in `lib/golden-label-quality-rig.ts`.
 * Usage (MJ repo root, private env loaded, AI_VENDOR_API_KEY__OpenAILLM and AI_VENDOR_API_KEY__GeminiLLM set):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/golden-label-quality.ts \
 *     <labeler-a.json> <labeling-guide.md> <golden-set.json (out)> <labels-audit.json (out)> --max-cost <USD>
 *   --max-cost: the labeler spend across resumed runs; the spend can pass it by about one call (see the lib's JSDoc).
 * Exit: 0 = written, Passed; 1 = written, failed the check (problems printed); 2 = usage, bootstrap, budget,
 * checkpoint or provider-call error (no golden set written; answers so far stay in the checkpoint).
 */
import { RigCLI } from '../lib/rig-cli';
import { GoldenLabelQualityRig } from './lib/golden-label-quality-rig';

const USAGE = 'usage: golden-label-quality.ts <labeler-a.json> <labeling-guide.md> <golden-set.json> <labels-audit.json> --max-cost <USD>';

/** Reads the command line and runs the rig. */
async function main(): Promise<number> {
    return GoldenLabelQualityRig.Run(GoldenLabelQualityRig.ParseArgs(process.argv.slice(2)));
}

void RigCLI.Main(main, USAGE);
