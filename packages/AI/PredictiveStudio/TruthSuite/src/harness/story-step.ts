import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import '@memberjunction/server-bootstrap-lite';
import '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { BootstrapIntegrationServer } from '@memberjunction/testing-integration';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { TrustVerdicts } from '@memberjunction/predictive-studio-core';

/** The facts a user would have after a build, in the words the agent receives them. */
function storyRequest(model: MJMLModelEntity): string {
  const trust = TrustVerdicts.DeriveTrustVerdict(model);
  const weights = Object.entries(SafeJSONParse<Record<string, number>>(model.FeatureImportance || '{}') || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([f, w]) => `${f} (${(w * 100).toFixed(1)}%)`)
    .join(', ');
  return [
    `Our model predicting ${model.TargetVariable} is already built and trained (ML Model ${model.ID}, version ${model.Version}).`,
    `Holdout metrics: ${model.HoldoutMetrics || 'none'}. Trust: ${trust.grade} — ${trust.oneLiner}`,
    `Feature weights recorded for it: ${weights || 'none'}.`,
    'Do not call any sub-agent or action and do not train anything. Give me the summary you give after a build',
    '(your "Report" step): what it predicts, how good it is with the metric explained, and which features it weighted most.',
  ].join('\n');
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: 'string' }, out: { type: 'string' }, count: { type: 'string' } } });
  if (!values.model || !values.out) throw new Error('usage: story-step.ts --model <id> --out <file> [--count <n>]');
  const count = Math.max(1, Number(values.count || '1'));
  const ctx = await BootstrapIntegrationServer();
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => a.Name === 'Model Development Agent');
  if (!agent) throw new Error("'Model Development Agent' is not in the agent metadata");
  // The run-scoped provider the bootstrap set up, not the process-global one (coding standards §6).
  const model = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
  if (!(await model.Load(values.model))) throw new Error(`ML Model ${values.model} not found`);
  const stories: Array<string | null> = [];
  let lastAgentRunId: string | null = null;
  let lastFinalStep: string | null = null;
  for (let i = 0; i < count; i++) {
    const result = await new AgentRunner(ctx.Provider).RunAgent({
      agent,
      conversationMessages: [{ role: 'user', content: storyRequest(model) }],
      contextUser: ctx.User,
      absoluteMaxIterations: 3,
    });
    // The user-facing text of the run's final step; null when the agent ended without one (counts as "no story").
    const story = result.success && result.agentRun?.Message ? result.agentRun.Message : null;
    stories.push(story);
    lastAgentRunId = result.agentRun?.ID || null;
    lastFinalStep = result.agentRun?.FinalStep || null;
  }
  writeFileSync(
    values.out,
    JSON.stringify({ story: stories[0] ?? null, stories, agentRunId: lastAgentRunId, finalStep: lastFinalStep }, null, 2),
  );
  await ctx.ClosePool();
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(2);
}
