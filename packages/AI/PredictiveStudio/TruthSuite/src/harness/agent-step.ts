import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import '@memberjunction/server-bootstrap-lite';
import '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import { BootstrapIntegrationServer } from '@memberjunction/testing-integration';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { LoadMLModelInferenceProcessor, type PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import type { AgentStepResult } from './types';

LoadMLModelInferenceProcessor();

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { plan: { type: 'string' }, out: { type: 'string' } } });
  if (!values.plan || !values.out) throw new Error('usage: agent-step.ts --plan <file> --out <file>');
  const plan = SafeJSONParse<ModelingPlanSpec>(readFileSync(values.plan, 'utf8'));
  if (!plan) throw new Error(`Invalid plan JSON in ${values.plan}`);
  const ctx = await BootstrapIntegrationServer();
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === 'pipeline builder');
  if (!agent || agent.DriverClass !== 'PredictiveStudioPipelineBuilderAgent') {
    throw new Error(`'Pipeline Builder' agent missing or has DriverClass '${agent?.DriverClass || 'none'}'`);
  }
  const t0 = Date.now();
  const result = await new AgentRunner(ctx.Provider).RunAgent<Record<string, never>, PredictiveStudioBuilderPayload>({
    agent,
    conversationMessages: [{ role: 'user', content: 'build it' }],
    contextUser: ctx.User,
    payload: plan,
  });
  const build = result.payload?.BuildResult || null;
  const out: AgentStepResult = {
    AgentRunID: result.agentRun?.ID || null,
    AgentSuccess: result.success,
    AgentErrorMessage: result.agentRun?.ErrorMessage || null,
    BuildModelID: build?.modelId || null,
    BuildSuccess: build?.success === true,
    BuildErrorMessage: build?.errorMessage || null,
    WallMs: Date.now() - t0,
  };
  writeFileSync(values.out, JSON.stringify(out, null, 2));
  await ctx.ClosePool();
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(2);
}
