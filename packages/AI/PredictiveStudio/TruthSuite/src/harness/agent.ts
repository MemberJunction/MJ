import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { TruthSuite } from '../registry/load';
import { HarnessPaths } from './artifacts';
import { HarnessProcess } from './process';
import type { RunContext } from './run-fixtures';
import type { AgentStepResult } from './types';

/** Out-of-process agent runner wrappers for the truth harness. */
export class HarnessAgent {
  /** `<results dir>/agent`, created on first use. */
  private static agentWorkDir(): string {
    const dir = path.join(HarnessPaths.ResultsDir(), 'agent');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** `raw` reduced to a short file-name-safe tag. */
  private static safeTag(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  }

  /** Write `plan` to disk and run `agent-step.ts` in a child process without blocking the event loop. */
  public static async RunBuilderAgent(ctx: RunContext, plan: ModelingPlanSpec): Promise<AgentStepResult> {
    const root = TruthSuite.Root();
    const dir = HarnessAgent.agentWorkDir();
    const slug = `${HarnessAgent.safeTag(plan.Name || 'plan')}-${randomUUID().slice(0, 8)}`;
    const planFile = path.join(dir, `${slug}.plan.json`);
    const outFile = path.join(dir, `${slug}.out.json`);
    const logFile = path.join(dir, `${slug}.log`);
    writeFileSync(planFile, JSON.stringify(plan, null, 2));

    const script = path.join(root, 'src', 'harness', 'agent-step.ts');
    const child = await HarnessProcess.Run('npx', ['tsx', script, '--plan', planFile, '--out', outFile], { Cwd: root });
    writeFileSync(logFile, `${child.Stdout}\n--- stderr ---\n${child.Stderr}`);
    if (child.Code !== 0) {
      throw new Error(`agent-step.ts exited ${child.Code}: ${child.Stderr.trim() || child.Stdout.trim()}`);
    }
    const parsed = SafeJSONParse<AgentStepResult>(readFileSync(outFile, 'utf8'));
    if (!parsed) {
      throw new Error(`Invalid AgentStepResult JSON at ${outFile}`);
    }
    return parsed;
  }

  private static readonly storyQueues = new Map<string, Array<string | null>>();

  /** Run `story-step.ts` in a child process and return the generated story string (or null). */
  public static async GenerateStory(ctx: RunContext, modelId: string): Promise<string | null> {
    const key = `${ctx.RunID}:${modelId}`;
    const existing = HarnessAgent.storyQueues.get(key);
    if (existing && existing.length > 0) {
      return existing.shift() ?? null;
    }
    const root = TruthSuite.Root();
    const dir = HarnessAgent.agentWorkDir();
    const slug = `story-${HarnessAgent.safeTag(modelId)}-${randomUUID().slice(0, 8)}`;
    const outFile = path.join(dir, `${slug}.out.json`);
    const logFile = path.join(dir, `${slug}.log`);

    const script = path.join(root, 'src', 'harness', 'story-step.ts');
    const child = await HarnessProcess.Run('npx', ['tsx', script, '--model', modelId, '--count', '10', '--out', outFile], { Cwd: root });
    writeFileSync(logFile, `${child.Stdout}\n--- stderr ---\n${child.Stderr}`);
    if (child.Code !== 0) {
      throw new Error(`story-step.ts exited ${child.Code}: ${child.Stderr.trim() || child.Stdout.trim()}`);
    }
    const parsed = SafeJSONParse<{ story: string | null; stories?: Array<string | null> }>(readFileSync(outFile, 'utf8'));
    const batch = parsed?.stories && parsed.stories.length > 0 ? [...parsed.stories] : [parsed?.story ?? null];
    const first = batch.shift() ?? null;
    HarnessAgent.storyQueues.set(key, batch);
    return first;
  }
}
