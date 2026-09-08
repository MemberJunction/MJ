---
'@memberjunction/codegen-lib': patch
---

Escape single quotes in generated entity descriptions before interpolating them into SQL. The AI-generated description is free text and routinely contains apostrophes; one unescaped quote aborted the entire CodeGen run with "Unclosed quotation mark" at the end of an otherwise-complete pass. The entity-name literals in the same function are escaped as well. '' doubling is correct on both supported dialects.
