# Assistant Prefill & Stop Sequences Guide

## Overview

MemberJunction's AI framework supports two powerful techniques for controlling LLM output format and reducing token usage:

1. **Assistant Prefill** — Pre-seed the beginning of the model's response so it continues from a specific starting point
2. **Stop Sequences** — Tell the model to stop generating when it encounters specific text

When used together, these techniques can eliminate the need for verbose prompt instructions like "Return ONLY valid JSON" and mechanically enforce structured output.

## How It Works

### The Pattern

```typescript
const params = new ChatParams();
params.model = 'claude-sonnet-4-5-20250514';
params.messages = [
    { role: 'user', content: 'List the top 3 programming languages with their use cases' }
];

// Prefill: model thinks it already started a JSON code block
params.assistantPrefill = '```json\n';

// Stop sequence: model stops when it would close the code block
params.stopSequences = ['```'];

const result = await llm.ChatCompletion(params);
// result.data.choices[0].message.content contains ONLY the raw JSON
// No markdown fencing, no preamble, no trailing commentary
```

### What Happens Under the Hood

1. **Prefill**: The model receives the conversation with a partial assistant message (`\`\`\`json\n`) already "written". It continues generating from that point, which puts it into "JSON code block" mode.
2. **Stop Sequence**: When the model would naturally close the code block with `\`\`\``, generation stops immediately.
3. **Result**: You get clean, parseable JSON without any surrounding text.

### Important: Prefill Is Not in the Response

The prefill text is **not included** in the response content. If your downstream code needs the full output including the prefill, prepend it yourself:

```typescript
const fullOutput = params.assistantPrefill + result.data.choices[0].message.content;
```

## Common Patterns

### Extract Raw JSON

```typescript
params.assistantPrefill = '{';
params.stopSequences = undefined; // Let the model finish naturally
// Response starts with the rest of the JSON object: "key": "value", ...}
```

### Extract JSON with Markdown Fencing

```typescript
params.assistantPrefill = '```json\n';
params.stopSequences = ['\n```'];  // newline-anchored: matches the CLOSING fence only
// Response is clean JSON between the fences
```

> Only do this on a provider with **native prefill support** (see the table below). On a non-prefill provider the model may emit a preamble before the fence, and the stop sequence will truncate the response — set the prefill/stop via the **prompt entity** instead, where `AIPromptRunner` gates the stop sequence automatically.

### Force a Specific Response Prefix

```typescript
params.assistantPrefill = 'Sure! Here is the SQL query:\n```sql\n';
params.stopSequences = ['```'];
// Response is just the SQL, no preamble
```

### Skip Preamble

```typescript
params.assistantPrefill = 'The answer is: ';
// Model continues directly with the answer
```

## Provider Support

### Providers with Native Prefill Support

| Provider | Implementation | Notes |
|---|---|---|
| **Anthropic** | Trailing assistant message | Claude's native prefill — the original implementation of this pattern |
| **Mistral** | `prefix: true` flag on assistant message | Uses Mistral's dedicated prefix API |
| **Groq** | Trailing assistant message | [Documented](https://console.groq.com/docs/prefilling) with dedicated guide |
| **Bedrock** | Trailing assistant message (Claude models only) | Only works with `anthropic.*` model IDs |
| **Ollama** | Trailing assistant message | Works with locally-hosted models |
| **OpenRouter** | Trailing assistant message (inherits from OpenAI provider) | Support depends on the underlying model being routed to |

### Providers Where Prefill Is Silently Ignored

The following providers do not support prefill. When `assistantPrefill` is set, the parameter is ignored and the request proceeds normally:

- OpenAI
- Azure OpenAI
- Gemini / Vertex
- Cerebras
- Fireworks
- xAI (Grok)
- Zhipu
- MiniMax
- LM Studio
- BettyBot

For these providers, MemberJunction's prompt runner can automatically inject a system instruction as a fallback — see [Automatic Fallback](#automatic-fallback-for-non-supporting-providers) below.

### Stop Sequences — Universal Support

`stopSequences` is supported by **all** LLM providers in the framework. It is defined on `BaseParams` and mapped to each provider's native stop parameter.

> ⚠️ **Critical pitfall: a fence stop sequence is only safe *with* prefill.**
> The `` ``` `` (or `"\n```"`) stop sequence used to fence JSON output assumes the response **begins at the opening fence** — which only happens when native prefill is applied. Without prefill, a model is free to emit a preamble *before* the fence (e.g. Gemini: `Here is the JSON requested:\n```json\n{…}`). That preamble line manufactures a `"\n```"` (or `` ``` ``) at the **opening** fence, so the stop fires immediately and the response is truncated to just the preamble — an empty/invalid result.
>
> The prompt runner now guards against this automatically — see [Stop-Sequence Safety on Non-Prefill Providers](#stop-sequence-safety-on-non-prefill-providers). The pitfall still applies if you set `stopSequences` **manually** on `ChatParams` for a non-prefill provider.

#### Anchor the closing fence with a leading newline

Prefer `"\n```"` over a bare `` ``` `` as the stop token. The leading newline anchors it to a *closing* fence (which sits on its own line: `…}\n```​`) and avoids matching an opening `` ```json `` when prefill places the fence at the very start of the response. Note that `AIPromptRunner` trims only spaces/tabs from each comma-split stop token (not newlines), specifically so a configured `"\n```"` keeps its leading newline.

## Benefits

### Token Savings
- Eliminates verbose format instructions from prompts ("Return ONLY valid JSON, do not include any explanation...")
- Stops generation as soon as the useful content is complete (no trailing "Let me know if you need anything else!")

### Consistency
- Mechanically enforces output format rather than relying on the model following instructions
- Dramatically reduces malformed output for structured data extraction

### Parsing Simplicity
- Response is directly parseable — no regex extraction needed
- No need to strip markdown fencing or conversational wrappers

## Integration with MJ Prompt System

### Entity-Level Configuration

The `MJ: AI Prompts` entity has built-in fields for prefill:

| Field | Type | Description |
|---|---|---|
| `AssistantPrefill` | `nvarchar(MAX)` | The prefill text for this prompt (e.g. `` ```json ``) |
| `StopSequences` | `nvarchar(MAX)` | Comma-delimited stop sequences. When paired with `AssistantPrefill`, these are auto-suppressed on models that don't support native prefill — see [Stop-Sequence Safety](#stop-sequence-safety-on-non-prefill-providers). |
| `PrefillFallbackMode` | `nvarchar(20)` | `Ignore`, `SystemInstruction`, or `None` |

When `AIPromptRunner` executes a prompt, it reads these fields and automatically applies prefill with provider-aware logic.

### Automatic Fallback for Non-Supporting Providers

When the selected provider doesn't support native prefill, the `PrefillFallbackMode` controls what happens:

- **`Ignore`** (default) — Silently skip prefill. The prompt executes normally without it.
- **`SystemInstruction`** — Inject a system message instructing the model to start its response with the prefill text. The instruction template is resolved from a three-level cascade.
- **`None`** — No fallback. Prefill only works with natively supporting providers.

### Fallback Text Cascade

When `PrefillFallbackMode` is `SystemInstruction`, the fallback instruction text is resolved using a three-level cascade (most specific wins, `null` means inherit):

1. **AI Model Type** → `PrefillFallbackText` (broadest default, e.g., for all LLMs)
2. **AI Model** → `PrefillFallbackText` (model-specific override, e.g., for GPT-4o)
3. **AI Model Vendor** → `PrefillFallbackText` (vendor-specific override, e.g., for Claude on Bedrock vs Claude on Anthropic)

Use `{{prefill}}` as a placeholder in the text. If no level provides fallback text, a built-in default is used:

> `IMPORTANT: You must begin your response with exactly the following text (do not add quotes or modify it): {{prefill}}`

The same cascade determines `SupportsPrefill` (whether native prefill is available):
**AI Model Type** → **AI Model** → **AI Model Vendor**

(Code-level note: the resolved value starts from the driver default `BaseLLM.SupportsPrefill` — `false` by default, overridden to `true` by prefill-capable drivers such as Anthropic — and is then overridden by a non-null `AIModel.SupportsPrefill`, then a non-null `AIModelVendor.SupportsPrefill`. `AIModelType.SupportsPrefill` is intentionally not used in this resolution because it is `NOT NULL DEFAULT 0` and can't express "inherit.")

### Stop-Sequence Safety on Non-Prefill Providers

A prompt's `StopSequences` are frequently **paired** with `AssistantPrefill` to fence JSON output: prefill `` ```json `` and stop on the closing `"\n```"`. As described in the [pitfall above](#stop-sequences--universal-support), that pairing is only safe when native prefill is actually applied — otherwise the stop fires on the *opening* fence and truncates the response.

To make this safe by default, `AIPromptRunner` **couples stop sequences to prefill support**:

- If a prompt has **`AssistantPrefill` set** and the resolved model/vendor **does not support native prefill** (`SupportsPrefill` resolves to `false`), the prompt's `StopSequences` are **not sent** to the model. The full response comes through and the runner's normal JSON extraction strips the fence/preamble.
- If the model **does** support native prefill (e.g. Anthropic), prefill *and* the stop sequence are applied together as intended — the token-saving optimization is preserved.
- If a prompt declares `StopSequences` **without** `AssistantPrefill`, those are treated as independent stop tokens and are **always** applied (not affected by prefill support).

This means you can configure one prompt with `AssistantPrefill = "```json"` + `StopSequences = "\n```"` and run it across *both* prefill-capable and non-prefill models: capable models get the fenced-output optimization, and non-prefill models automatically fall back to returning the full (extractable) response instead of a truncated one. This gating happens regardless of `PrefillFallbackMode` — even `Ignore` (no fallback instruction) is safe, because the dangerous stop is simply withheld.

> The decision is centralized in `AIPromptRunner.shouldApplyStopSequences(prompt, model, vendorId, llm)`, which returns `true` for independent stop sequences and, for prefill-paired ones, defers to `resolveSupportsPrefill(...)`.

### Programmatic Usage

You can also set prefill directly on `ChatParams` when calling LLMs outside the prompt system:

```typescript
const chatParams = new ChatParams();
chatParams.model = 'claude-sonnet-4-5-20250514';
chatParams.messages = [
    { role: 'user', content: 'List the top 3 languages' }
];
chatParams.assistantPrefill = '```json\n';
chatParams.stopSequences = ['```'];

const result = await llm.ChatCompletion(chatParams);
```

## References

- [Anthropic Prefill Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response)
- [Groq Prefilling Guide](https://console.groq.com/docs/prefilling)
- [Mistral Prefix Guide](https://docs.mistral.ai/guides/prefix)
- [AWS Bedrock Claude Messages API](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html)
