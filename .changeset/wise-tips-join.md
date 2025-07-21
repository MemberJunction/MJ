---
"@memberjunction/ai-agents": patch
"@memberjunction/ai": patch
"@memberjunction/ai-prompts": patch
---

Add comprehensive context length handling with intelligent model
selection

This release adds sophisticated context length management to prevent
infinite retry loops when AI models encounter context length exceeded
errors.

**New Features:**

- **ContextLengthExceeded Error Type**: New error classification for
  context length exceeded errors
- **Smart Failover Logic**: Automatically switches to models with larger
  context windows when context errors occur
- **Proactive Model Selection**: Estimates token usage and selects
  appropriate models before execution
- **Context-Aware Sorting**: Prioritizes models by context window size
  during failover

**Enhanced Components:**

- **ErrorAnalyzer**: Detects context_length_exceeded errors from
  provider codes, error messages, and JSON objects
- **AIPromptRunner**: Adds token estimation, context validation, and
  intelligent model reselection
- **Failover System**: Context-aware candidate selection with detailed
  logging

**Key Improvements:**

- Prevents infinite agent stalling on context length exceeded errors
- Reduces API costs by avoiding repeated failed attempts with
  insufficient context models
- Improves reliability through proactive context length validation
- Provides detailed logging for monitoring and debugging

**Breaking Changes:**

- None - all changes are backward compatible

**Migration Notes:**

- No migration required - existing code will automatically benefit from
  enhanced context handling
- Models with MaxInputTokens/MaxOutputTokens configured will be
  prioritized appropriately
- Context length validation occurs transparently during prompt execution

This resolves the critical issue where agents would infinitely retry
prompts that exceed model context limits, improving system reliability
and reducing unnecessary API calls.
