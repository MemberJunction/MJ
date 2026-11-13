---
'@memberjunction/ai-prompts': patch
'@memberjunction/global': patch
---

Prompt output parsing: an object reply holding one complete JSON value followed by a stray fragment now uses the value and logs the dropped text (#3065, new exported `ExtractLeadingJSONValue`); a prompt with `ValidationBehavior: 'None'` no longer has its reply keys rewritten by validation-syntax cleaning unless `cleanValidationSyntax` is set, and keys that clean to the same name are kept as written instead of one overwriting the other (#4827); the "your … here" / "insert … here" placeholder check scans linearly (#4819).
