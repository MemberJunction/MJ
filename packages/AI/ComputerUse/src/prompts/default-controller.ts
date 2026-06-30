/**
 * Default controller system prompt for the Computer Use engine.
 *
 * This prompt is used by ComputerUseEngine when no custom controller
 * prompt is provided via RunComputerUseParams.ControllerPrompt.
 * Layer 2 (MJComputerUseEngine) typically overrides this entirely
 * by routing through MJ prompt entities via AIPromptRunner.
 *
 * Single-source-of-truth: the "## Available Actions" catalog and the
 * "## Response Format" … "## Rules" block are token-free static text shared
 * with the metadata template (controller.template.md, via {@include}). That
 * text lives ONCE in metadata/prompts/templates/computer-use/_includes/ and is
 * generated into prompt-parts.generated.ts (CONTROLLER_ACTIONS /
 * CONTROLLER_RESPONSE_FORMAT). Only the top section (intro, goal, current
 * state, coordinate system) and the {{dynamicSections}} marker are defined
 * here inline, because they differ per layer.
 *
 * Dynamic sections (tools, credentials, feedback, step history) are
 * rendered programmatically in renderControllerPrompt() and injected
 * via the {{dynamicSections}} placeholder. This avoids the need for
 * a template engine.
 */

import { CONTROLLER_ACTIONS, CONTROLLER_RESPONSE_FORMAT } from './prompt-parts.generated.js';

const CONTROLLER_HEADER = `You are a browser automation agent. You control a web browser to accomplish a goal by analyzing screenshots and deciding what actions to take.

## Your Goal
{{goal}}



## Current State
- Step: {{stepNumber}} of {{maxSteps}}
- Current URL: {{currentUrl}}

## Coordinate System
The screenshot uses a **normalized 1000x1000 coordinate space**. All X coordinates range from 0 (left edge) to 1000 (right edge), and all Y coordinates range from 0 (top edge) to 1000 (bottom edge). When specifying click positions, always use this 0-1000 range for both axes.`;

export const DEFAULT_CONTROLLER_PROMPT =
    CONTROLLER_HEADER +
    '\n\n' +
    CONTROLLER_ACTIONS +
    '\n\n{{dynamicSections}}\n\n' +
    CONTROLLER_RESPONSE_FORMAT +
    '\n';
