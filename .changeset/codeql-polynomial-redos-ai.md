---
"@memberjunction/ai": patch
"@memberjunction/ai-prompts": patch
---

Replace six regular expressions that CodeQL flagged as polynomial (`js/polynomial-redos`) with linear scans that match exactly the same text. Crafted provider error messages or prompt text could make the old expressions take quadratic time.

- `ErrorAnalyzer` (`@memberjunction/ai`): the "missing field/property" checks and the JSON extraction from an error message. A third check, `/\w+\s+is\s+required/`, is removed: it only ran when the message didn't contain "required", so it could never match.
- `AIPromptRunner` (`@memberjunction/ai-prompts`): trimming spaces and tabs from each stop sequence (still keeping leading and trailing newlines), and reading the MIME type from an artifact-manifest line.

No behavior change. Each replacement is tested against the expression it replaces on a generated corpus, and against the repeated-input shapes CodeQL reported.
