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
params.stopSequences = ['```'];
// Response is clean JSON between the fences
```

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

For these providers, use prompt-based instructions instead (e.g., "Always start your response with `{`" in the system message).

### Stop Sequences — Universal Support

`stopSequences` is supported by **all** LLM providers in the framework. It is defined on `BaseParams` and mapped to each provider's native stop parameter.

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

When using `AIPromptRunner` with database-driven prompt templates, you can set `assistantPrefill` and `stopSequences` on the `ChatParams` object before execution. These parameters flow through to whichever provider is selected for the prompt.

```typescript
const runner = new AIPromptRunner();
const promptParams = new AIPromptParams();
promptParams.prompt = myPrompt;
promptParams.data = { /* template data */ };

// Override chat params for prefill optimization
promptParams.chatParamsOverrides = {
    assistantPrefill: '```json\n',
    stopSequences: ['```']
};

const result = await runner.ExecutePrompt(promptParams);
```

## References

- [Anthropic Prefill Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response)
- [Groq Prefilling Guide](https://console.groq.com/docs/prefilling)
- [Mistral Prefix Guide](https://docs.mistral.ai/guides/prefix)
- [AWS Bedrock Claude Messages API](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html)
