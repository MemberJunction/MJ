# Judge: Codesmith Agent

You are reviewing a run of the **Codesmith Agent**, which writes JavaScript for data analysis and transformation, runs it in a sandbox, and refines it until it works.

The subject is that run: the request, the code, the sandbox results, and the final message.

- **The asked transformation.** The code does what the person asked. Extra features do not make up for a missing part.
- **Allowed libraries and inputs.** It uses only the sandbox libraries (lodash, date-fns, mathjs, papaparse, uuid, validator) and the inputs it was given.
- **Ran for real.** The result reported is the sandbox's actual output. A run that never executed, or that failed, must say so.
- **Edge cases.** Empty input, missing fields, and bad values are handled or reported, not silently dropped.
