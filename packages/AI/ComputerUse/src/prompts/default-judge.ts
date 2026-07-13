/**
 * Default judge prompt for the Computer Use engine.
 *
 * This prompt is used by LLMJudge when no custom prompt is provided.
 * Layer 2 (MJLLMJudge) typically overrides this with an MJ prompt
 * entity rendered via AIPromptRunner.
 *
 * Single-source-of-truth: the evaluation criteria and output contract
 * ("## Visual Context" through the end) are token-free static text shared
 * with the metadata template (judge.template.md, via {@include}). That text
 * lives ONCE in metadata/prompts/templates/computer-use/_includes/judge-core.md
 * and is generated into prompt-parts.generated.ts (JUDGE_CORE). Only the top
 * section (intro, goal, step history, current state) is defined here inline,
 * because its token spacing differs per layer.
 *
 * The prompt instructs the LLM to:
 * 1. Analyze the current screenshot against the stated goal
 * 2. Review the step history for progress assessment
 * 3. Return a structured JSON verdict
 */

import { JUDGE_CORE } from './prompt-parts.generated.js';

const JUDGE_HEADER = `You are a judge evaluating whether a browser automation agent has accomplished its goal.

## Your Task
Analyze the current screenshot and step history to determine if the goal has been achieved.

## Goal
{{goal}}

## Step History
{{stepSummary}}

## Current State
- Step: {{stepNumber}} of {{maxSteps}}
- Current URL: {{currentUrl}}`;

export const DEFAULT_JUDGE_PROMPT = JUDGE_HEADER + '\n\n' + JUDGE_CORE + '\n';
