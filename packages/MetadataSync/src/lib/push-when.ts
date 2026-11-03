/**
 * @fileoverview The `pushWhen` folder setting: a folder is pushed only when the
 * environment variable it names is `true` or `1`.
 * @module push-when
 */

import fs from 'fs-extra';
import path from 'path';
import { IsEnvFlagTrue, ParseEnvReference } from './env-reference';

/** Whether push should run over a folder, and why not. */
export interface PushWhenDecision {
  Push: boolean;
  /** Why the folder is skipped, or null when it is pushed. Never contains the variable's value. */
  Reason: string | null;
}

/** A folder that push skipped because of its `pushWhen`. */
export interface SkippedDirectory {
  Directory: string;
  Reason: string;
}

/** Folders split by their `pushWhen`. */
export interface PushWhenFilterResult {
  Included: string[];
  Skipped: SkippedDirectory[];
}

/**
 * Checks the form of a `pushWhen` value.
 * @returns An error message, or null when the value is a plain `@env:VAR` reference
 */
export function PushWhenError(pushWhen: unknown): string | null {
  if (typeof pushWhen !== 'string') {
    return 'pushWhen must be a string like "@env:VARIABLE"';
  }
  const reference = ParseEnvReference(pushWhen);
  if (!reference) {
    return `pushWhen "${pushWhen}" must be an @env: reference, like "@env:VARIABLE"`;
  }
  if (reference.Optional) {
    return `pushWhen "${pushWhen}" cannot use ?optional`;
  }
  return null;
}

/**
 * Decides whether a folder with this `pushWhen` is pushed. An absent value always pushes.
 * @throws Error when the value is malformed (see {@link PushWhenError})
 */
export function EvaluatePushWhen(pushWhen: unknown, env: NodeJS.ProcessEnv = process.env): PushWhenDecision {
  if (pushWhen === undefined) {
    return { Push: true, Reason: null };
  }
  const problem = PushWhenError(pushWhen);
  if (problem) {
    throw new Error(problem);
  }
  const variableName = ParseEnvReference(pushWhen)?.VariableName ?? '';
  const value = env[variableName];
  if (value === undefined || value.trim() === '') {
    return { Push: false, Reason: `${variableName} is not set` };
  }
  if (!IsEnvFlagTrue(value)) {
    return { Push: false, Reason: `${variableName} is not true` };
  }
  return { Push: true, Reason: null };
}

/**
 * Splits folders into the ones push runs over and the ones their `pushWhen` skips.
 * Keeps the input order.
 * @throws Error naming the config file when it cannot be read, is not a JSON object, or has a malformed `pushWhen`
 */
export function FilterByPushWhen(directories: string[], env: NodeJS.ProcessEnv = process.env): PushWhenFilterResult {
  const result: PushWhenFilterResult = { Included: [], Skipped: [] };
  for (const directory of directories) {
    const configPath = path.join(directory, '.mj-sync.json');
    const decision = decide(configPath, env);
    if (decision.Push) {
      result.Included.push(directory);
    } else {
      result.Skipped.push({ Directory: directory, Reason: decision.Reason ?? '' });
    }
  }
  return result;
}

function decide(configPath: string, env: NodeJS.ProcessEnv): PushWhenDecision {
  if (!fs.existsSync(configPath)) {
    return { Push: true, Reason: null };
  }
  const config: unknown = fs.readJsonSync(configPath);
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error(`Invalid .mj-sync.json in ${configPath}: expected a JSON object`);
  }
  const pushWhen: unknown = (config as Record<string, unknown>).pushWhen;
  try {
    return EvaluatePushWhen(pushWhen, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid pushWhen in ${configPath}: ${message}`);
  }
}
