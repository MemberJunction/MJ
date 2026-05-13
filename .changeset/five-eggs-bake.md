---
"@memberjunction/codegen-lib": patch
"@memberjunction/core-entities": patch
---

Emit `override` modifier on CodeGen-generated `Delete()`. Consumers compiling with `noImplicitOverride: true` were hitting TS4114. Compile-time-only; no runtime change. Fixes #2588
