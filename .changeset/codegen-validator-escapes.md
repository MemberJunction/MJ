---
"@memberjunction/codegen-lib": minor
---

CodeGen no longer corrupts generated validators that use escapes. A validator whose code has real
line breaks is written as it is; only a validator the model returned as one double-escaped line has
its `\n`, `\t` and `\"` turned into characters. Before, a validator with `/[\s\t\r\n]/g` or a
string holding `\"` was written as code that does not compile.
