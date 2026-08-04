# Actions — when to write one, when not to

MJ Actions are a metadata-driven way to expose functionality to AI agents,
workflow engines, and low-code builders. They're a clean abstraction layer
when used at system *boundaries*. They're a footgun when used as a substitute
for direct function calls inside your own code.

## The rule

**Actions are boundaries. Direct imports are for internal calls.**

```typescript
// ✅ GOOD — an Action exposes "summarize content" to AI agents.
// The Action is the entry point; it uses the AI prompt runner directly.
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';

class SummarizeContentAction extends BaseAction {
    async run(params: ActionParams) {
        const p = new AIPromptParams();
        p.prompt = this.getPrompt('Summarize Content');
        p.data = { content: params.content };
        const runner = new AIPromptRunner();
        return await runner.ExecutePrompt(p);
    }
}

// ❌ BAD — Action calling another Action just to invoke a prompt.
// Loses type safety, adds metadata-lookup overhead, hides the actual call path.
class SummarizeContentAction extends BaseAction {
    async run(params: ActionParams) {
        return await this.executeAction('Execute AI Prompt', params, user);
    }
}
```

## When to use an Action

Use an Action when you're at the *edge* of your system:

- **AI agents** discovering and running operations through metadata
- **Workflow engines** chaining steps without knowing the implementation
- **Low-code builders** wiring up business logic visually
- **External integrations** that need a stable, discoverable contract

Examples that justify being Actions:
- `Send Email` (Communication service exposed to agents)
- `Create Invoice` (business process exposed to workflow)
- `Get Web Page Content` (utility wrapped for agent use)
- `Validate Data` (re-usable step in a workflow)

## When NOT to use an Action

When the caller is *your own code*. Direct imports beat Actions in every
dimension that matters internally:

- **Type safety**: TypeScript checks the call site against the function signature
- **Performance**: No metadata lookup, no parameter serialization
- **Debuggability**: Stack traces show the actual function, not "executeAction"
- **Refactoring**: IDE rename works; "find references" works
- **Composability**: Functions take real types as inputs

```typescript
// ❌ Inside an Action, calling another Action for internal work
class GenerateReportAction extends BaseAction {
    async run() {
        const data = await this.executeAction('Fetch Source Data', ...);
        const summary = await this.executeAction('Summarize Content', ...);
        // metadata lookup × 2, type safety: 0, debuggability: 0
    }
}

// ✅ Same logic with direct imports
import { fetchSourceData } from '@memberjunction/data-context';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class GenerateReportAction extends BaseAction {
    async run() {
        const data = await fetchSourceData(...);
        const summary = await new AIPromptRunner().ExecutePrompt(...);
        // typed, traceable, fast
    }
}
```

## The mental test

When you're about to call something, ask: **who else needs to be able to
discover and call this?**

- If the answer is "an AI agent / workflow engine / external system" → it's
  an Action, AND the underlying logic lives in a service class the Action
  calls directly.
- If the answer is "just my own code, the package next door, MJAPI internals"
  → import the class or function. Call it directly.

You can have *both* in the same codebase: a service class (`AIPromptRunner`)
that all internal callers use, and an Action (`Execute AI Prompt`) that wraps
the same service class for external callers.

## Keep Actions thin

A well-written Action is mostly:

1. Validate input params
2. Look up referenced records / data
3. Call into a service class
4. Wrap the result for the Action return shape

If your Action has hundreds of lines of business logic inline, that logic
belongs in a service class. Make the Action a thin wrapper. Other places
(scheduled jobs, tests, internal callers) can then use the service class
without going through the Action machinery.

## Why this matters

The MJ Action system is metadata-driven by design — discoverability is the
whole feature. That discoverability has a cost (the metadata lookup, the
serialization, the indirection). When the caller doesn't need
discoverability — your own code, your own package — paying that cost is
pure tax.

Treat Actions like a public REST API: useful at the system edge, miserable
when used as the only way to call your own functions.
