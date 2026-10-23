/**
 * Gate G0.6 "W1 → S9.3": Predictive Studio's UI text, its Core strings and the story prompt make no causal claims, and
 * 10 of 10 stories generated for the W1-signal s42 model make none. An LLM judge (MJ's llm-judge oracle) grades both
 * against PsGateJudge.Criteria; the story generator and the judge run on live models.
 */
import path from 'node:path';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe, RunFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateJudge } from './ps-gates/ps-gate-judge';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The MJ: Tests row the judge grades under (its Name). */
const TEST_NAME = 'W1 -> S9.3';

/** The sources G0.6 judges. */
class CausalCopySources {
  /** The PS sources whose strings a person reads: the dashboard UI, Core, and the story prompt templates. */
  public static ScannedFiles(): string[] {
    const root = PsGateSpecs.MJRoot;
    return [
      ...PsGateSpecs.Walk(path.join(root, 'packages/Angular/Explorer/dashboards/src/PredictiveStudio'),
        (f) => /\.(ts|html)$/.test(f) && !/\.test\.ts$/.test(f)),
      ...PsGateSpecs.Walk(path.join(root, 'packages/AI/PredictiveStudio/Core/src'), (f) => f.endsWith('.ts') && !f.includes('__tests__')),
      ...ContainmentProbe.StoryPromptFiles(root),
    ];
  }
}

export const PsGateW1S93Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s9-3.G0.6', Name: 'G0.6 W1 → S9.3: UI text and 10 of 10 generated stories make no causal claims (LLM judge)', RequiresLiveModel: true,
    Fn: async (ctx) => {
      if (!process.env.AI_VENDOR_API_KEY__GeminiLLM) {
        throw new Error('G0.6 needs AI_VENDOR_API_KEY__GeminiLLM: the story generator runs on GeminiLLM (D2-33)');
      }
      const h = await PsGate.Harness(ctx);
      const files = CausalCopySources.ScannedFiles();
      const model = await RunFixtures.W1S42ValidatedModel(h);
      const stories: string[] = [];
      for (let i = 0; i < 10; i++) {
        const story = await h.GenerateStory(model.ModelID);
        if (story !== null) stories.push(story);
      }
      const uiTexts = PsGateSpecs.UserFacingStrings(files); // string literals from the scanned .ts/.html files
      const ui = PsGateJudge.Verdict(await PsGateJudge.NoCausalClaims(ctx, uiTexts, TEST_NAME));
      const st = PsGateJudge.Verdict(await PsGateJudge.NoCausalClaims(ctx, stories, TEST_NAME));
      PsGate.Assert({
        Passed: ui.Passed && st.Passed && stories.length === 10,
        Measured: { filesScanned: files.length, textsJudged: uiTexts.length, storiesGenerated: stories.length, uiJudge: ui.Detail, storiesJudge: st.Detail },
        Detail: `UI text: ${ui.Detail}; stories: ${st.Detail}`,
      });
    },
  },
];

for (const c of PsGateW1S93Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-3', PsGate.Lifecycle);
