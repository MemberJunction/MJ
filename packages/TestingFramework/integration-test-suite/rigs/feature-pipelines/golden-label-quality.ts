/**
 * golden-label-quality.ts — feature-pipeline rig: labels every golden case with labelers B (OpenAI) and C (Google)
 * under the written guide, adjudicates against labeler A, and writes the golden set with its label-quality record.
 * Usage (MJ repo root, private env loaded, AI_VENDOR_API_KEY__OpenAILLM and AI_VENDOR_API_KEY__GeminiLLM set):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/golden-label-quality.ts \
 *     <labeler-a.json> <labeling-guide.md> <golden-set.json (out)> <labels-audit.json (out)> --max-cost <USD>
 * Exit: 0 = written, Passed; 1 = written, failed the check (problems printed); 2 = usage, bootstrap, budget,
 * checkpoint or provider-call error (no golden set written; answers so far stay in the checkpoint).
 */
import { GoldenLabelQualityRig } from './lib/golden-label-quality-rig';

async function main(): Promise<void> {
    try {
        const code = await GoldenLabelQualityRig.Run(GoldenLabelQualityRig.ParseArgs(process.argv.slice(2)));
        process.exit(code);
    } catch (e: unknown) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(2);
    }
}

void main();
