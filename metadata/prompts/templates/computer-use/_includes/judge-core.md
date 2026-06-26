## Visual Context
- The current browser screenshot is attached as the final image.
- If recent screenshot history is available, earlier screenshots are attached in chronological order (oldest first) before the current one. Use these to assess visual progression.

## Instructions
1. Carefully examine the current screenshot (and screenshot history if provided)
2. Compare the visible state against the stated goal
3. Consider both the step history and visual progression — is the agent making progress or stuck?
4. If the goal is partially complete, provide specific feedback on what remains
5. Determine if the goal is **impossible** to accomplish given the current state (see below)

## Response Format
Respond with ONLY a JSON object (no other text):

**Goal accomplished:**
```json
{
  "done": true,
  "impossible": false,
  "confidence": 0.95,
  "reason": "The goal has been accomplished — [specific evidence]",
  "feedback": ""
}
```

**Goal not yet accomplished but still achievable:**
```json
{
  "done": false,
  "impossible": false,
  "confidence": 0.7,
  "reason": "The agent is making progress but has not yet completed [specific remaining work]",
  "feedback": "Specific guidance on what the agent should do next"
}
```

**Goal is impossible to accomplish:**
```json
{
  "done": false,
  "impossible": true,
  "confidence": 0.9,
  "reason": "The goal cannot be accomplished because [specific blocker]",
  "feedback": ""
}
```

## Field Definitions
- **"done"**: `true` ONLY if the goal is fully accomplished and visible on screen
- **"impossible"**: `true` when you are confident the goal **cannot** be accomplished regardless of what actions the agent takes. Set this when you observe:
  - Access denied / permission errors that the agent cannot resolve
  - The target page, element, or feature definitively does not exist
  - A prerequisite is missing that the agent has no way to fulfill
  - An error message on screen indicates a **permanent** failure (NOT a transient/retryable condition)
  - The agent has tried multiple **distinct** approaches and all have clearly failed

  **NEVER mark `impossible` for a page that is still loading.** A loading or boot screen — a spinner, a blank/white page that is still initializing, or text such as `Loading workspace...`, `Loading configurations...`, `Spinning up resources...`, or a `Reset` prompt — is a **transient environment condition, not impossibility**. This app runs in a resource-constrained environment where these screens can persist for **60+ seconds** and across **several reloads** before the UI appears. Repeatedly waiting on or reloading a loading screen is **correct, progressing recovery behavior** — it is explicitly NOT an "unrecoverable loop." While such a screen is showing, return `"impossible": false` and `"done": false` so the agent can keep waiting/retrying. Only conclude the load has failed if the app has clearly never appeared after the agent has reloaded **several times over multiple minutes**.
- **"confidence"**: how certain you are (0.0 = guessing, 1.0 = absolutely certain)
- **"reason"**: concise explanation of what you see and why you reached your verdict
- **"feedback"**: if not done and not impossible, specific guidance on what the agent should do next. Empty string if done or impossible.

**Important:** Be conservative with `"impossible": true`. Only use it when you are genuinely confident there is no path forward. If the agent has only tried one approach and it failed, suggest an alternative approach instead. Reserve impossibility for situations where all reasonable paths are clearly blocked. **A still-loading page is never impossible — when in doubt on a loading/boot screen, return `impossible: false`.**
