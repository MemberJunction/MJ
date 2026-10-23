/**
 * Gate G0.6 "W1 → S9.3": Predictive Studio's UI text, Core's copy and the story prompt make no causal claims, and
 * 10 of 10 stories generated for the W1-signal s42 model make none. An LLM judge (MJ's llm-judge oracle), told what the
 * texts are, grades them against PsGateJudge.Criteria one source file (at most 50 texts) per judgment, the stories in
 * their own chunk, after a causal control it must fail. The story generator and the judge run on live models.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateJudge } from './ps-gates/ps-gate-judge';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The MJ: Tests row the judge grades under (its Name). */
const TEST_NAME = 'W1 -> S9.3';

/** The stories G0.6 judges. */
class StorySteps {
  /** Ten stories for the Validated W1 s42 fixture model (a story the generator returns as null is not counted). */
  public static async Generate(h: TruthHarness): Promise<string[]> {
    const model = await RunFixtures.W1S42ValidatedModel(h);
    const stories: string[] = [];
    for (let i = 0; i < 10; i++) {
      const story = await h.GenerateStory(model.ModelID);
      if (story !== null) stories.push(story);
    }
    return stories;
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
      const files = PsGateSpecs.ScannedFiles();
      const stories = await StorySteps.Generate(h);
      const groups = PsGateSpecs.UserFacingTexts(files);
      const chunks = PsGateJudge.Chunks([...groups, { Label: 'generated stories (W1 s42)', Texts: stories }]);
      const judged = await PsGateJudge.JudgeAll(chunks, await PsGateJudge.ForContext(ctx, TEST_NAME));
      PsGate.Assert({
        Passed: judged.Passed && stories.length === 10,
        Measured: {
          filesScanned: files.length, filesWithText: groups.length, textsJudged: groups.reduce((n, g) => n + g.Texts.length, 0),
          storiesGenerated: stories.length, chunksJudged: judged.ChunksJudged, chunksFailed: judged.FailedChunks.length,
        },
        Detail: `${stories.length} of 10 stories generated; ${judged.Detail}`,
      });
    },
  },
];

for (const c of PsGateW1S93Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-3', PsGate.Lifecycle);
