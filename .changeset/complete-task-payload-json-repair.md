---
"@memberjunction/ai-agents": patch
---

`complete_task` no longer throws away a finished answer because the model wrote part of its `payloadChangeRequest` layout as escape sequences.

`payloadChangeRequest` is a JSON string argument, so the model writes JSON inside a string. In long payloads the model sometimes switches, partway through, to writing the document's own newlines as `\n` escapes, usually right after a long string value such as a SQL query (`"…ASC"\n    }\n  }\n}`). `JSON.parse` rejected the whole payload, the step became a Retry, and on the forced final turn the iteration limit then failed a run that had a correct answer in hand. Gemini 3.8 Flash did exactly this.

- **Repair.** New `DecodeJSONArgument` (in `native-tools/json-argument.ts`) parses normally first. Only if that fails does it turn `\n`, `\r` and `\t` escapes that sit outside string literals back into whitespace and parse again. A backslash is never valid JSON outside a string, so the repair cannot change the meaning of a document that was already valid, and escapes inside strings are untouched. Each repair is logged.
- **A useful retry.** When the payload still cannot be parsed, the Retry message now ends with `Problem: <the parser's error>` instead of only saying the argument must be an object.
