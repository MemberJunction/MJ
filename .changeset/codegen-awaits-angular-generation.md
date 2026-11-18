---
"@memberjunction/codegen-lib": patch
---

CodeGen awaits each non-core Angular form group before it moves on. The call was not awaited, so its Promise stood in for the result: a group whose generation failed never failed the phase (a Promise is always truthy), and the phase returned while the forms were still being written, so AFTER commands that edit them (such as trimming entries out of `generated-forms.module.ts`) could run first and have their edits overwritten. A failed group now fails the run with `FILE_GENERATION: Error generating Angular code`, and a rejected one fails it before any AFTER command runs.
